/** One-time Android tip: Realme/Oppo/Xiaomi battery savers kill Chrome in the pocket. */
export default function BatteryTip({ onDismiss }) {
  return (
    <section class="card tip">
      <p class="eyebrow">One-time tip</p>
      <h2>Let Outward keep going in your pocket</h2>
      <p>
        Some phones stop Chrome when the screen is off. Open <strong>Settings → Apps → Chrome → Battery</strong> and
        choose <strong>Unrestricted</strong> (on Realme: <strong>Allow background activity</strong>).
      </p>
      <button class="btn" onClick={onDismiss}>
        Done
      </button>
    </section>
  );
}
