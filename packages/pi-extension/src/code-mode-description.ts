export const CODE_MODE_RUN_TOOL_DESCRIPTION = [
	"Run TypeScript with the declared mac CodeModeApi only; do not invent methods or inspect the proxy.",
	"Available: mac.screenshot, mac.openApp, mac.getAppState, mac.listApps, mac.click, mac.doubleClick, mac.rightClick, mac.move, mac.drag, mac.scroll, mac.type, mac.pressKeys, mac.setValue, mac.selectText, mac.performAction, mac.getCursorPosition.",
	"Launch browser pages with mac.openApp('Safari', { url: 'https://search.brave.com/search?q=fable%205' }), then call mac.getAppState('Safari') and surface(state.screenshot).",
	"For coordinate clicks, take captureId/displayEpoch from state.captureFrame and pass them with x/y; elementIndex from state.elements is preferred when available.",
	"For scrolling, use mac.scroll(app, { direction: 'down', amount: 8 }) or { elementIndex }; if a web page does not move, use mac.pressKeys(app, ['space']) or ['page_down'] for down and ['shift+space'], ['page_up'], or ['cmd+up'] for up/top.",
	"Key aliases include enter/return, escape/esc, space, tab, home, end, page_down/pagedown/page-down/pgdn, page_up/pageup/page-up/pgup, and arrow keys.",
	"Call surface(handle) to show screenshots; return a value or console.log concise progress.",
].join(" ");
