import { Runtime } from "@/components/runtime";

export default function Home() {
  return (
    <header className="flex h-12 items-center gap-2 border-b bg-panel px-4">
      <span aria-hidden className="size-3 rounded-sm bg-primary" />
      <span className="text-lg font-semibold">SoftOne Agents</span>
      <Runtime />
    </header>
  );
}
