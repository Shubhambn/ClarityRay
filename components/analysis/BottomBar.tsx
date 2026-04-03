export function BottomBar() {
  return (
    <div className="relative z-20 flex items-center justify-between border-t border-green-500/8 px-8 py-3 bg-black/50 backdrop-blur-sm">
      <div className="flex items-center gap-8 text-xs text-white/40 mono">
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 bg-green-500 rounded-full" />
          <span>No data leaves this device</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 bg-green-500 rounded-full" />
          <span>Local ONNX inference</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 bg-green-500 rounded-full" />
          <span>Open source</span>
        </div>
      </div>
    </div>
  );
}
