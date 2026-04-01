import Link from 'next/link';

export default function Home() {
  return (
    <main className="card">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Welcome to ClarityRay</h2>
        <p className="text-sm text-slate-300">
          This browser-only demo screens chest X-rays locally using ONNX Runtime Web. No data leaves your device.
        </p>
        <Link className="btn" href="/analyze">
          Go to Analyzer
        </Link>
      </div>
    </main>
  );
}
