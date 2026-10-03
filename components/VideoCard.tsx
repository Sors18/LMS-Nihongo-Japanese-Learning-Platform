import type { ComponentProps } from "react";

type Props = {
  id: number;
  youtube_id: string;
  title: string;
  level: string;
  category?: string;
  duration: number;
  subtitleCount?: number;
};

const levelColor: Record<string, string> = {
  N5: "bg-emerald-500 text-white",
  N4: "bg-sky-500 text-white",
  N3: "bg-amber-400 text-white",
  N2: "bg-orange-500 text-white",
  N1: "bg-rose-500 text-white",
};

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function VideoCard({ id, youtube_id, title, level, category, duration, subtitleCount }: Props) {
  const thumb = `https://img.youtube.com/vi/${youtube_id}/hqdefault.jpg`;
  return (
    <a
      href={`/video/${id}`}
      className="group block overflow-hidden rounded-2xl border border-sakura-200 bg-white hover:border-sakura-300 hover:shadow-md transition-all"
    >
      <div className="relative aspect-video overflow-hidden bg-sakura-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt={title}
          className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          loading="lazy"
        />
        <div className="absolute left-2 top-2 flex gap-1.5">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide ${levelColor[level] ?? "bg-slate-600 text-white"}`}
          >
            {level}
          </span>
          <span className="rounded-full bg-sakura-100 border border-sakura-200 px-2.5 py-0.5 text-xs font-bold tracking-wide text-sakura-700">
            {category ?? "SHORT"}
          </span>
        </div>
        <span className="absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-mono text-white">
          {formatDuration(duration)}
        </span>
      </div>
      <div className="p-3 bg-white">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800 group-hover:text-sakura-700">
          {title}
        </h3>
        {typeof subtitleCount === "number" && (
          <div className="mt-2 flex items-center">
            <span className="shrink-0 rounded-full bg-sakura-100 border border-sakura-200 px-1.5 py-0.5 text-[11px] text-sakura-700">
              {subtitleCount} phụ đề
            </span>
          </div>
        )}
      </div>
    </a>
  );
}
