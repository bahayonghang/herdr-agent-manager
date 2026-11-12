import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { theme } from "herdr";
export const MODE_LABELS = { inherit: "Inherit", native: "CLI native", prompt: "Ask / restricted", auto: "Auto", "full-access": "YOLO" };
export function button(id, text, action, active = false, disabled = false) {
  const t = theme();
  return h_flex().id(id).h(30).px(10).gap(5).items_center().rounded(6).flex_none()
    .bg(active ? t.selected : t.raised).border(1).border_color(active ? t.accent : t.border)
    .text_size(12).text_color(disabled ? t.dim : t.foreground)
    .when(!disabled, el => el.cursor_pointer().hover(s => s.bg(t.hover)))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => { cx.stop_propagation(); if (!disabled) action(e, cx); }).child(text);
}
export function caption(text) { return div().text_size(11).text_color(theme().dim).child(text); }
export function heading(text) { return div().text_size(16).font_semibold().text_color(theme().foreground).child(text); }
export function badge(text, warn = false) {
  const t = theme(); return div().px(6).py(2).rounded(4).bg(t.raised).text_size(10).text_color(warn ? t.blocked : t.muted).child(text);
}
export function notice(text, warn = false) {
  const t = theme(); return div().p(10).rounded(6).bg(t.raised).text_size(12).text_color(warn ? t.blocked : t.muted).child(text);
}
export function field(state, label) {
  const t = theme(); return v_flex().gap(4).w_full().child(caption(label))
    .child(Input.new(state).h(34).px(9).w_full().rounded(6).border(1).border_color(t.input).bg(t.background).text_color(t.foreground).text_size(12));
}
export function input(value = "", onChange) {
  const state = InputState.new({ value });
  state.on("change", (_e, cx) => { onChange?.(state.value()); cx.notify(); });
  return state;
}
export function cycleMode(id, value, modes, action) {
  return button(id, MODE_LABELS[value] ?? value, (_e, cx) => action(modes[(modes.indexOf(value) + 1) % modes.length], cx), value === "full-access");
}
