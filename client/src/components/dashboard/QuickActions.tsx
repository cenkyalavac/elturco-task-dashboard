import { FolderKanban, Receipt, ShoppingCart, Star } from "lucide-react";

export default function QuickActions() {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
      <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-3">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => { window.location.hash = "#/projects?create=true"; }}
          className="bg-white/[0.05] hover:bg-white/[0.1] rounded-xl p-3 text-center transition-all duration-200"
        >
          <FolderKanban className="w-5 h-5 text-blue-400 mx-auto mb-1" />
          <span className="text-[10px] text-white/70 font-medium">New Project</span>
        </button>
        <button
          onClick={() => { window.location.hash = "#/invoices"; }}
          className="bg-white/[0.05] hover:bg-white/[0.1] rounded-xl p-3 text-center transition-all duration-200"
        >
          <Receipt className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
          <span className="text-[10px] text-white/70 font-medium">New Invoice</span>
        </button>
        <button
          onClick={() => { window.location.hash = "#/purchase-orders"; }}
          className="bg-white/[0.05] hover:bg-white/[0.1] rounded-xl p-3 text-center transition-all duration-200"
        >
          <ShoppingCart className="w-5 h-5 text-amber-400 mx-auto mb-1" />
          <span className="text-[10px] text-white/70 font-medium">New PO</span>
        </button>
        <button
          onClick={() => { window.location.hash = "#/quality?tab=qs-entry"; }}
          className="bg-white/[0.05] hover:bg-white/[0.1] rounded-xl p-3 text-center transition-all duration-200"
        >
          <Star className="w-5 h-5 text-purple-400 mx-auto mb-1" />
          <span className="text-[10px] text-white/70 font-medium">Quick QS</span>
        </button>
      </div>
    </div>
  );
}
