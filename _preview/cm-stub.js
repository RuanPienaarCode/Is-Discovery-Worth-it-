/* CodeMirror stand-in: the harness has no editor, so the Live Preview
   extension only has to load. (Live Preview chips are proven in Obsidian.) */
export const ViewPlugin = { fromClass: () => ({}) };
export const Decoration = { mark: () => ({}), none: {} };
export const EditorView = { domEventHandlers: () => ({}) };
export class RangeSetBuilder { add() {} finish() { return {}; } }
