import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import * as H from "herdr";
import { adapterFor, supportedModes } from "./adapters.js";
import { registry, defaultEntry } from "./model.js";
import { store, currentSpace, findSpace, loadAgents, requestLaunch, showError, labelHost } from "./runtime.js";
import { button, caption, notice, MODE_LABELS } from "./ui.js";

export default class AgentMenu extends View {
  init(_props, cx) {
    const space = currentSpace();
    this.spaceId = space?.id; this.machine = space?.machine ?? null; this.agents = []; this.loading = true;
    this.handle = cx.focus_handle(); this.handle.focus();
    cx.spawn(async cx => {
      try { this.agents = await loadAgents(this.machine); } catch (e) { this.error = String(e.message ?? e); }
      this.loading = false; cx.notify();
    });
  }
  dismiss() { const id = H.props()?.overlay; if (id) H.closeOverlay(id); }
  launch(entry, preview = false) {
    if (!entry || this.loading || this.error) return;
    try { requestLaunch(entry, findSpace(this.spaceId), preview); this.dismiss(); } catch (e) { showError(e); }
  }
  action(fn) { try { fn(); this.dismiss(); } catch (e) { showError(e); } }
  render(cx) {
    const t = H.theme(), space = findSpace(this.spaceId);
    let c, entries = [];
    try { c = store.read(); entries = registry(c, this.machine, this.agents).filter(e => e.enabled).map(e => ({ ...e, supported: supportedModes(adapterFor(e.agentKey, c.adapters[e.agentKey])).includes(e.permission) })); }
    catch (e) { this.error = String(e.message ?? e); }
    const usable = entries.filter(e => e.installed !== false && e.supported);
    const chosen = c ? defaultEntry(c, this.machine, this.spaceId, usable) : null;
    const ready = H.machines().some(m => (m.name ?? null) === this.machine && m.layout === "ready");
    const disabled = this.loading || Boolean(this.error) || !space || !ready;
    const start = entry => {
      const keyIndex = usable.findIndex(e => e.id === entry.id);
      const shortcut = keyIndex < 0 ? "" : [keyIndex < 9 ? String(keyIndex + 1) : "", entry.profile?.shortcut].filter(Boolean).join(" / ");
      const icon = entry.icon ? (entry.tint ? svg(entry.icon).size(16).text_color(t.foreground) : image(entry.icon).size(16)) : div().w(16).child("◇");
      return h_flex().id(`menu-${entry.id}`).h(42).px(9).gap(8).items_center().rounded(6).flex_none()
        .text_color(entry.installed === false ? t.dim : t.foreground)
        .when(!disabled && entry.installed !== false && entry.supported, el => el.cursor_pointer().hover(s => s.bg(t.selected)))
        .on_click(() => { if (!disabled && entry.installed !== false && entry.supported) this.launch(entry); })
        .child(icon).child(v_flex().flex_1().min_w(0).gap(2)
          .child(div().text_size(12.5).truncate().child(entry.name))
          .child(caption(entry.installed === false ? "not installed" : !entry.supported ? "permission mode unsupported" : `${MODE_LABELS[entry.permission]}${entry.profile ? " · preset" : ""}`)))
        .child(caption(shortcut));
    };
    return v_flex().id("agent-manager-menu").track_focus(this.handle).size_full().min_h(0).p(7).gap(5).bg(t.popover).text_color(t.foreground)
      .on_key_down((event, cx) => {
        if (event.modifiers.control || event.modifiers.platform || event.modifiers.alt || disabled) return;
        let entry;
        const digit = event.modifiers.shift && "!@#$%^&*(".includes(event.key) ? String("!@#$%^&*(".indexOf(event.key) + 1) : event.key;
        if (/^[1-9]$/.test(digit)) entry = usable[Number(digit) - 1];
        else if (event.key === "enter") entry = chosen;
        else entry = usable.find(e => e.profile?.shortcut === event.key.toLowerCase());
        if (entry) { cx.stop_propagation(); this.launch(entry, event.modifiers.shift); }
      })
      .child(h_flex().gap(6).items_center().child(caption(labelHost(this.machine))).child(div().flex_1())
        .child(button("open-manager", "Manage…", () => this.action(() => H.openOverlay({ mod: "agent-manager", kind: "dialog", width: 1080, height: 780, props: { space: this.spaceId } })))))
      .child(button("new-terminal", "Terminal", () => this.action(() => {
        if (space) H.run("tab.new", { space: space.id }); else H.run("space.new", { machine: this.machine ?? "" });
      })))
      .when(Boolean(chosen), el => el.child(button("default-launch", `↵ ${chosen?.name ?? "Default"}`, () => this.launch(chosen), true, disabled)))
      .child(caption("Start an agent · Shift + shortcut previews"))
      .child(v_flex().id("menu-list").flex_1().min_h(0).overflow_y_scrollbar().children(entries.map(start))
        .when(this.loading, el => el.child(notice("Checking agents…")))
        .when(Boolean(this.error), el => el.child(notice(this.error, true)))
        .when(!this.loading && !entries.length, el => el.child(notice("No enabled agents. Open Manage to enable or register one."))))
      .child(div().h(1).bg(t.border))
      .child(button("new-space", "New space", () => this.action(() => H.run("space.new", { machine: this.machine ?? "" }))))
      .child(h_flex().gap(6)
        .child(button("new-worktree", "New worktree…", () => this.action(() => H.openOverlay({ mod: "worktree", kind: "dialog", width: 460, height: 280,
          props: { space: this.spaceId, action: "new" } })), false, !space || !ready))
        .child(button("open-worktree", "Open worktree…", () => this.action(() => H.openOverlay({ mod: "worktree", kind: "dialog", width: 560, height: 480,
          props: { space: this.spaceId, action: "open" } })), false, !space || !ready)));
  }
}
