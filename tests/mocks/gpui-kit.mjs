// Contract mock only: this does not paint native GPUI or emulate native event routing.
export class View {}
export class Element {
  constructor(kind) { this.kind = kind; this.nodes = []; this.events = {}; this.attrs = {}; }
  child(child) { if (child == null) throw new Error('Null GPUI child'); this.nodes.push(child); return this; }
  children(children) { if (!Array.isArray(children)) throw new Error('children must be array'); children.forEach(c => this.child(c)); return this; }
  when(condition, callback) { return condition ? callback(this) : this; }
  hover(callback) { callback(element('hover')); return this; }
}
for (const method of 'id h w size size_full w_full h_full min_h min_w max_w px py p pt pb pl gap rounded items_center justify_center justify_end justify_between flex flex_1 flex_none text_color text_size font_semibold font_medium bg border border_1 border_b border_color cursor_pointer truncate overflow_y_scrollbar overflow_x_scrollbar track_focus opacity'.split(' '))
  Element.prototype[method] = function(...args) { this.attrs[method] = args; return this; };
for (const method of ['on_click', 'on_mouse_down', 'on_mouse_up', 'on_hover', 'on_key_down'])
  Element.prototype[method] = function(...args) { this.events[method] = args.at(-1); return this; };
export const element = kind => new Element(kind);
export const div = () => element('div');
export const svg = () => element('svg');
export const image = () => element('image');
export function find(root, id) { if (root?.attrs?.id?.[0] === id) return root; for (const child of root?.nodes ?? []) { const result = find(child, id); if (result) return result; } return null; }
export function text(root) { return typeof root === 'string' ? root : (root?.nodes ?? []).map(text).join(' '); }
export const errors = [];
export function context() {
  return { notify() {}, stop_propagation() {}, focus_handle: () => ({ focus() {} }),
    spawn(fn) { fn(context()).catch(e => errors.push(e)); }, timer: { after(_ms, fn) { fn(context()); }, every() {} } };
}
