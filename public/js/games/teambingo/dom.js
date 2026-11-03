import { $ as commonLookup } from '../../views/dom.js';
export { element } from '../../views/dom.js';
// The copied game has its own DOM and handlers, while notices belong to the room shell.
export const $ = id => commonLookup(id === 'lineNotices' ? id : `next-${id}`);
