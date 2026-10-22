export default function App(): React.JSX.Element {
  const { versions } = window.kinoteka

  return (
    <main className="welcome">
      <div className="brand">
        <span className="brand-mark" />
        Kinotéka
      </div>
      <p className="lead">Kostra aplikace je připravená. Přehrávač přibude v prvním přírůstku.</p>
      <p className="versions">
        Electron {versions.electron} · Chromium {versions.chrome} · Node {versions.node}
      </p>
    </main>
  )
}
