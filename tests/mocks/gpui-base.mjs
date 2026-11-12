import { element } from './gpui-kit.mjs';
export const h_flex = () => element('h-flex');
export const v_flex = () => element('v-flex');
export const InputState = { new({ value }) { return { data: value, events: {}, value() { return this.data; }, on(event, fn) { this.events[event] = fn; }, focus() {}, set_selected_range() {} }; } };
export const Input = { new(state) { const e = element('input'); e.state = state; return e; } };
