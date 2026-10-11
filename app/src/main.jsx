import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app.jsx';
import './styles.css';

registerSW({ immediate: true });

// Battery: every CSS animation (Sprig, the campfire) pauses while the page is hidden.
const syncHidden = () => document.documentElement.classList.toggle('is-hidden', document.hidden);
document.addEventListener('visibilitychange', syncHidden);
syncHidden();

render(<App />, document.getElementById('app'));
