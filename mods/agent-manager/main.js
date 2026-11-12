import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import * as H from "herdr";
import { fresh, freshHost, KEY, MODES, clone, validate, hostKey, hostConfig, registry, updateHost, move, toggle,
  defaultEntry, deleteProfile, exportConfig, parseImport, parseJson, newId } from "./model.js";
import { adapterFor, supportedModes } from "./adapters.js";
import { store, currentSpace, findSpace, labelHost, loadAgents, requestLaunch, resolvePlan, executePlan, probeCLI, saveProgram, asyncAction, showError } from "./runtime.js";
import { button, heading, caption, badge, notice, field, input, cycleMode, MODE_LABELS } from "./ui.js";

export default class AgentManager extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle(); this.agents = []; this.query = ""; this.filter = "All";
    this.machine = (findSpace(H.props()?.space) ?? currentSpace())?.machine ?? null;
    this.search = input("", value => { this.query = value; });
    this.generation = 0; this.editor = null; this.confirm = null; this.message = "";
    if (H.props()?.screen === "launch") this.loadPlan(cx); else this.refresh(cx);
    this.handle.focus();
    cx.spawn(async cx => { for (;;) { const command = await H.nextCommand(); if (command === "focus") this.handle.focus(); if (command === "refresh") this.refresh(cx); cx.notify(); } });
  }
  refresh(cx) {
    const generation = ++this.generation, machine = this.machine;
    this.busy = true; this.failed = false;
    cx.spawn(async cx => {
      try { const list = await loadAgents(machine); if (generation === this.generation) this.agents = list; }
      catch (e) { if (generation === this.generation) { this.message = String(e.message ?? e); this.failed = true; } }
      if (generation === this.generation) this.busy = false;
      cx.notify();
    });
  }
  loadPlan(cx) {
    this.plan = null; this.planError = ""; this.launched = false;
    cx.spawn(async cx => {
      try { this.plan = await resolvePlan(H.props().entry, H.props().space); }
      catch (e) { this.planError = String(e.message ?? e); }
      cx.notify();
    });
  }
  change(transform, cx, expected) {
    try { store.change(transform, expected); this.message = "Saved"; }
    catch (e) { this.message = String(e.message ?? e); }
    cx.notify();
  }
  dismiss(cx) { this.editor = null; this.confirm = null; cx.notify(); }
  profile(entry, duplicate, cx) {
    const original = entry.profile, p = original ? clone(original) : {
      id: newId(), name: `${entry.name} preset`, agent: entry.agentKey, scope: hostKey(this.machine),
      permission: "inherit", args: [], run: null, model: "", env: {}, shortcut: ""
    };
    if (duplicate) { p.id = newId(); p.name += " copy"; p.shortcut = ""; }
    this.editor = { kind: "profile", profile: p, revision: store.read().revision, machine: this.machine,
      name: input(p.name), args: input(JSON.stringify(p.args)), run: input(p.run ? JSON.stringify(p.run) : ""),
      model: input(p.model), env: input(JSON.stringify(p.env)), shortcut: input(p.shortcut) };
    cx.notify();
  }
  addAgent(cx) {
    this.editor = { kind: "agent", key: `ham-${newId()}`, name: input("Custom Agent"), run: input('["your-cli"]'),
      icon: input(""), adapter: "generic" }; cx.notify();
  }
  transfer(kind, cx) {
    this.editor = { kind, path: input(`${H.appHome()}/agent-manager-export.json`), value: null, revision: store.read().revision };
    cx.notify();
  }
  renderLaunch(cx) {
    const t = H.theme(), plan = this.plan;
    return v_flex().size_full().p(20).gap(12).bg(t.popover).text_color(t.foreground)
      .child(heading("Review agent launch"))
      .when(!plan && !this.planError, el => el.child(notice("Checking the target host and preparing the command…")))
      .when(Boolean(this.planError), el => el.child(notice(this.planError, true)))
      .when(Boolean(plan), el => el.child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().gap(10)
        .child(heading(plan?.name ?? ""))
        .child(caption(`Host: ${labelHost(plan?.machine)}  ·  Space: ${findSpace(plan?.space)?.name ?? "closed"}`))
        .child(caption(`Working folder: ${plan?.folder || "host home"}`))
        .child(notice(plan?.display ?? ""))
        .when(Boolean(plan?.environment.length), row => row.child(caption(`Environment overrides: ${plan?.environment.join(", ")} (values hidden)`)))
        .children((plan?.notices ?? []).map(s => notice(s, plan?.risky)))
        .child(caption("Only this new session changes. Existing sessions and the CLI's own settings remain untouched."))))
      .child(h_flex().gap(8).justify_end()
        .child(button("launch-reload", "Refresh preview", (_e, cx) => this.loadPlan(cx)))
        .child(button("launch-cancel", "Cancel", () => H.closeOverlay(H.props().overlay)))
        .child(button("launch-confirm", plan?.risky ? "I understand · Launch" : "Launch", () => {
          if (this.launched) return;
          try { executePlan(this.plan); this.launched = true; H.closeOverlay(H.props().overlay); } catch (e) { showError(e); }
        }, true, !plan || this.launched)));
  }
  renderEditor(cx, c) {
    const e = this.editor, t = H.theme();
    const body = v_flex().w_full().gap(10).p(14).bg(t.surface).rounded(8).border(1).border_color(t.border);
    const cancel = button("editor-cancel", "Close editor", (_e, cx) => this.dismiss(cx));
    if (e.kind === "profile") {
      const p = e.profile, adapter = adapterFor(p.agent, c.adapters[p.agent]);
      return body.child(heading(`${c.profiles.some(x => x.id === p.id) ? "Edit" : "New"} launch preset`))
        .child(caption(`Base agent: ${p.agent} · Adapter: ${adapter}. Blank command uses the detected command.`))
        .child(field(e.name, "Display name"))
        .child(h_flex().gap(8)
          .child(cycleMode("profile-mode", p.permission, ["inherit", ...supportedModes(adapter)], (mode, cx) => { p.permission = mode; cx.notify(); }))
          .child(button("profile-scope", p.scope === "*" ? "All hosts" : "This host only", (_ev, cx) => { p.scope = p.scope === "*" ? hostKey(e.machine) : "*"; cx.notify(); })))
        .child(field(e.run, 'Executable override · JSON array, e.g. ["C:\\\\Tools\\\\agent.exe"]'))
        .child(field(e.args, 'Additional arguments · JSON array, e.g. ["--verbose"]'))
        .child(field(e.model, "Model (optional; otherwise CLI default)"))
        .child(field(e.shortcut, "Menu shortcut: one lowercase letter (optional; 1–9 are automatic)"))
        .child(field(e.env, 'Environment overrides · JSON object, e.g. {"LANG":"en_US.UTF-8"}'))
        .child(notice("Do not store API keys here. Environment values and arguments persist in shared.json. Exports omit environment values, but not arbitrary arguments."))
        .child(h_flex().gap(8).justify_end().child(cancel).child(button("profile-save", "Save preset", (_ev, cx) => {
          try {
            const next = { ...p, name: e.name.value().trim(), run: parseJson(e.run.value(), null),
              args: parseJson(e.args.value(), []), model: e.model.value().trim(), env: parseJson(e.env.value(), {}), shortcut: e.shortcut.value().trim() };
            store.change(c => { c.profiles = [...c.profiles.filter(x => x.id !== p.id), next]; return validate(c); }, e.revision);
            this.editor = null; this.message = "Preset saved";
          } catch (err) { this.message = String(err.message ?? err); }
          cx.notify();
        }, true)));
    }
    if (e.kind === "agent") {
      return body.child(heading("Register a custom Agent"))
        .child(caption(`Program key: ${e.key}. Registration updates this client's programs.json for all hosts.`))
        .child(field(e.name, "Agent name")).child(field(e.run, "Command · non-empty JSON argument array"))
        .child(field(e.icon, "Icon path inside Herdr home (optional)"))
        .child(button("custom-adapter", `Adapter: ${e.adapter}`, (_ev, cx) => {
          const choices = ["generic", "claude", "codex", "grok", "copilot"];
          e.adapter = choices[(choices.indexOf(e.adapter) + 1) % choices.length]; cx.notify();
        }))
        .child(notice("Use a real executable or shell function, not an alias. Choose an adapter only when this command accepts that CLI's flags."))
        .child(h_flex().gap(8).justify_end().child(cancel).child(button("custom-save", "Register command", (_ev, cx) => {
          if (e.busy) return; e.busy = true; cx.notify();
          cx.spawn(async cx => {
            try { await saveProgram({ key: e.key, name: e.name.value(), run: JSON.parse(e.run.value()), icon: e.icon.value() || null, adapter: e.adapter });
              if (this.editor === e) this.editor = null;
              cx.timer.after(1200, cx => this.refresh(cx));
            } catch (err) { this.message = String(err.message ?? err); }
            e.busy = false; cx.notify();
          });
        }, true, e.busy)));
    }
    return body.child(heading(e.kind === "import" ? "Import configuration" : "Export configuration"))
      .child(field(e.path, "Absolute local file path"))
      .child(notice(e.kind === "import" ? "Import replaces manager preferences, not programs.json. Review trusted files only: presets can contain executable commands. YOLO launch confirmation will be re-enabled." :
        "Environment values are omitted. Arguments, command paths and host names are included; review the file before sharing. Writing replaces an existing file at this path."))
      .when(Boolean(e.value), el => el.child(caption(`Reviewed ${e.value?.profiles.length} presets across ${Object.keys(e.value?.hosts ?? {}).length} host configurations`)))
      .child(h_flex().gap(8).justify_end().child(cancel)
        .child(button("transfer-action", e.kind === "export" ? "Write export" : "Read and validate", (_ev, cx) => asyncAction(cx, async () => {
          if (e.kind === "export") {
            const path = e.path.value().trim(), expected = await H.readTextFile(path);
            await H.writeTextFile(path, exportConfig(store.read()), expected); return "Export written";
          }
          const text = await H.readTextFile(e.path.value().trim());
          if (text === null) throw new Error("Import file does not exist");
          e.value = parseImport(text); e.revision = store.read().revision; return "Import validated. Review counts, then apply.";
        }, text => { this.message = text; }), true))
        .when(e.kind === "import" && Boolean(e.value), el => el.child(button("import-apply", "Apply reviewed import", (_ev, cx) => {
          try { store.replace(e.value, e.revision); this.editor = null; this.message = "Imported; previous settings saved as backup"; }
          catch (err) { this.message = String(err.message ?? err); } cx.notify();
        }, true))));
  }
  renderConfirm(cx) {
    const item = this.confirm;
    return v_flex().gap(8).p(12).bg(H.theme().raised).rounded(8)
      .child(notice(item.message, true))
      .child(h_flex().gap(8).justify_end()
        .child(button("confirm-cancel", "Cancel", (_e, cx) => { this.confirm = null; cx.notify(); }))
        .child(button("confirm-apply", "Confirm", (_e, cx) => { this.confirm = null; item.action(cx); }, true)));
  }
  render(cx) {
    if (H.props()?.screen === "launch") return this.renderLaunch(cx);
    const t = H.theme(); let c;
    try { c = store.read(); } catch (error) {
      return v_flex().size_full().p(20).gap(10).child(heading("Configuration could not be loaded"))
        .child(notice(String(error.message), true)).child(caption("Your data was not overwritten. Export shared.json before recovery."))
        .child(button("recover", "Back up broken data and reset manager", (_e, cx) => {
          H.setShared(`${KEY}.corrupt-backup`, H.shared(KEY)); H.setShared(KEY, fresh()); cx.notify();
        }));
    }
    const entries = registry(c, this.machine, this.agents), h = hostConfig(c, this.machine);
    const space = currentSpace()?.machine === this.machine ? currentSpace() : null;
    const selected = defaultEntry(c, this.machine, space?.id, entries);
    const query = this.query.trim().toLowerCase();
    const filtered = entries.filter(e => (!query || `${e.name} ${e.agentKey}`.toLowerCase().includes(query)) &&
      (this.filter === "All" || this.filter === "Enabled" && e.enabled || this.filter === "Disabled" && !e.enabled ||
       this.filter === "Missing" && e.installed === false || this.filter === "Presets" && e.profile));
    const ready = H.machines().some(m => (m.name ?? null) === this.machine && m.layout === "ready");
    const modes = ["native", "prompt", "auto", "full-access"];
    const row = entry => {
      const adapter = adapterFor(entry.agentKey, c.adapters[entry.agentKey]);
      const supported = supportedModes(adapter).includes(entry.permission);
      return v_flex().id(`entry-${entry.id}`).p(10).gap(6).rounded(7).border(1)
        .border_color(this.drag === entry.id ? t.accent : t.border).bg(t.surface)
        .on_mouse_up("left", (_e, cx) => {
          if (this.drag) { const from = this.drag; this.drag = null; cx.stop_propagation(); this.change(c => move(c, this.machine, entries, from, entry.id), cx); }
        })
        .child(h_flex().gap(8).items_center()
          .child(div().id(`grip-${entry.id}`).px(6).text_color(t.dim).child("⠿")
            .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.drag = entry.id; cx.notify(); }))
          .child(div().flex_1().min_w(0).font_semibold().truncate().child(entry.name))
          .child(badge(entry.profile ? "PRESET" : "AGENT"))
          .child(badge(entry.installed === null ? "Custom command" : entry.installed ? "Installed" : "Not installed", entry.installed === false))
          .child(button(`up-${entry.id}`, "↑", (_e, cx) => this.change(c => move(c, this.machine, entries, entry.id, entries[entries.findIndex(x => x.id === entry.id) - 1]?.id), cx), false, entries[0]?.id === entry.id))
          .child(button(`down-${entry.id}`, "↓", (_e, cx) => this.change(c => move(c, this.machine, entries, entry.id, entries[entries.findIndex(x => x.id === entry.id) + 1]?.id), cx), false, entries[entries.length - 1]?.id === entry.id)))
        .child(h_flex().gap(6).items_center()
          .child(button(`enabled-${entry.id}`, entry.enabled ? "Enabled" : "Disabled", (_e, cx) => this.change(c => toggle(c, this.machine, entry.id), cx), entry.enabled))
          .child(button(`default-${entry.id}`, selected?.id === entry.id ? "★ Default" : "Set default", (_e, cx) => this.change(c => updateHost(c, this.machine, { defaultEntry: entry.id }), cx), selected?.id === entry.id, !entry.enabled))
          .child(cycleMode(`mode-${entry.id}`, h.permissions[entry.id] ?? "inherit", ["inherit", ...supportedModes(adapter)], (mode, cx) => {
            this.change(c => { const host = hostConfig(c, this.machine); host.permissions = { ...host.permissions, [entry.id]: mode }; return updateHost(c, this.machine, host); }, cx);
          }))
          .child(caption(`${MODE_LABELS[entry.permission]}${supported ? "" : " · unsupported"}`))
          .child(div().flex_1())
          .child(button(`preview-${entry.id}`, "Preview", () => { try { requestLaunch(entry, space, true); } catch (e) { showError(e); } }, false, !space || !ready || this.busy || this.failed || !entry.enabled || entry.installed === false || !supported))
          .child(button(`run-${entry.id}`, "Launch", () => { try { requestLaunch(entry, space); } catch (e) { showError(e); } }, true, !space || !ready || this.busy || this.failed || !entry.enabled || entry.installed === false || !supported)))
        .child(h_flex().gap(6).items_center()
          .child(caption(`${entry.agentKey} · ${adapter}`))
          .child(div().flex_1())
          .child(button(`edit-${entry.id}`, entry.profile ? "Edit" : "Create preset", (_e, cx) => this.profile(entry, false, cx)))
          .when(Boolean(entry.profile), el => el.child(button(`copy-${entry.id}`, "Duplicate", (_e, cx) => this.profile(entry, true, cx)))
            .child(button(`delete-${entry.id}`, "Delete", (_e, cx) => {
              this.confirm = { message: `Delete preset '${entry.name}'? Running sessions are not affected.`, action: cx => this.change(c => deleteProfile(c, entry.profile.id), cx) }; cx.notify();
            })))
          .child(button(`space-${entry.id}`, "Default for Space", (_e, cx) => this.change(c => { c.spaces[space.id] = entry.id; return c; }, cx), c.spaces[space?.id] === entry.id, !space || !entry.enabled))
          .child(button(`probe-${entry.id}`, "Check CLI", (_e, cx) => asyncAction(cx, () => probeCLI(entry, this.machine), r => { this.message = `CLI: ${r.version || "version not reported"}; --help inspected`; }), false, !ready || entry.installed === false))
          .when(!entry.profile && entry.agentKey.startsWith("ham-"), el => el.child(button(`remove-${entry.id}`, "Unregister", (_e, cx) => {
            this.confirm = { message: `Remove '${entry.name}' from programs.json on this client? This affects discovery for all hosts. Presets are retained.`,
              action: cx => asyncAction(cx, () => saveProgram({ key: entry.agentKey }, true), (_result, taskCx) => { taskCx.timer.after(1200, cx => this.refresh(cx)); }) };
            cx.notify();
          }))));
    };
    return v_flex().id("agent-manager-root").track_focus(this.handle).size_full().min_w(0).min_h(0).p(18).gap(12).bg(t.popover).text_color(t.foreground).text_size(13)
      .on_mouse_up("left", (_e, cx) => { if (this.drag) { this.drag = null; cx.notify(); } })
      .on_hover((hovered, cx) => { if (!hovered && this.drag) { this.drag = null; cx.notify(); } })
      .child(h_flex().items_center().gap(10).child(heading("Agent Manager")).child(badge("1.0.0")).child(div().flex_1())
        .child(caption(`${entries.length} entries · ${labelHost(this.machine)}${ready ? "" : " · offline/loading"}`))
        .when(Boolean(H.props()?.overlay), el => el.child(button("close-manager", "Close", () => H.closeOverlay(H.props().overlay)))))
      .child(h_flex().gap(6).overflow_x_scrollbar().children(H.machines().map(m => button(`host-${hostKey(m.name)}`, labelHost(m.name), (_e, cx) => {
        this.machine = m.name ?? null; this.agents = []; this.editor = null; this.confirm = null; this.message = ""; this.refresh(cx);
      }, (m.name ?? null) === this.machine))))
      .child(v_flex().gap(7).p(12).bg(t.surface).rounded(8).border(1).border_color(t.border)
        .child(h_flex().gap(8).items_center().child(caption("Global permissions"))
          .children(modes.map(mode => button(`global-${mode}`, MODE_LABELS[mode], (_e, cx) => this.change(c => { c.defaultPermission = mode; return c; }, cx), c.defaultPermission === mode)))
          .child(div().flex_1())
          .child(button("risk-toggle", c.confirmRisk ? "Confirm YOLO: on" : "Confirm YOLO: off", (_e, cx) => {
            if (c.confirmRisk) { this.confirm = { message: "Disable the manager's extra YOLO launch confirmation? The CLI may then run destructive commands without asking.", action: cx => this.change(c => { c.confirmRisk = false; return c; }, cx) }; cx.notify(); }
            else this.change(c => { c.confirmRisk = true; return c; }, cx);
          }, c.confirmRisk)))
        .child(h_flex().gap(8).items_center().child(caption("This host"))
          .child(cycleMode("host-mode", h.permission, MODES, (permission, cx) => this.change(c => updateHost(c, this.machine, { permission }), cx)))
          .child(button("host-platform", `Platform: ${h.platform}`, (_e, cx) => {
            const values = ["auto", "unix", "windows"]; this.change(c => updateHost(c, this.machine, { platform: values[(values.indexOf(h.platform) + 1) % values.length] }), cx);
          }))
          .child(button("clear-space-default", "Clear Space default", (_e, cx) => this.change(c => { delete c.spaces[space.id]; return c; }, cx), false, !space || !c.spaces[space.id]))
          .child(div().flex_1()).child(caption("CLI native is not a restricted mode."))))
      .child(h_flex().gap(8).items_center().child(div().flex_1().min_w(80).child(field(this.search, "Search agents and presets")))
        .child(button("refresh", this.busy ? "Checking…" : "Refresh", (_e, cx) => this.refresh(cx), false, this.busy))
        .child(button("add-agent", "Add Agent", (_e, cx) => this.addAgent(cx), true))
        .child(button("import", "Import", (_e, cx) => this.transfer("import", cx)))
        .child(button("export", "Export", (_e, cx) => this.transfer("export", cx))))
      .child(h_flex().gap(6).children(["All", "Enabled", "Disabled", "Missing", "Presets"].map(filter => button(`filter-${filter}`, filter, (_e, cx) => { this.filter = filter; cx.notify(); }, this.filter === filter)))
        .child(div().flex_1()).child(button("reset-host", "Reset host", (_e, cx) => {
          this.confirm = { message: "Reset this host's ordering, visibility, permissions and default? Presets and other hosts are retained.", action: cx => this.change(c => updateHost(c, this.machine, freshHost()), cx) }; cx.notify();
        }))
        .child(button("restore", "Restore backup", (_e, cx) => {
          this.confirm = { message: "Restore the configuration from before the last import/restore?", action: cx => { try { store.restore(); this.message = "Backup restored"; } catch (e) { this.message = String(e.message); } cx.notify(); } }; cx.notify();
        })))
      .when(Boolean(this.message), el => el.child(notice(this.message, this.failed)))
      .when(Boolean(this.confirm), el => el.child(this.renderConfirm(cx)))
      .child(v_flex().id("manager-scroll").flex_1().min_h(0).overflow_y_scrollbar().gap(8)
        .when(Boolean(this.editor), el => el.child(this.renderEditor(cx, c)))
        .when(!filtered.length, el => el.child(notice(this.busy ? "Checking installed agents…" : "No matching agents. Refresh or register a custom command.")))
        .children(filtered.map(row)))
      .child(caption("Drag the grip or use ↑ / ↓. Preferences apply to this client's managed launcher only. CLI detection may be cached by Herdr for up to one minute."));
  }
}
