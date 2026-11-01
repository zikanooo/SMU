import React from 'react';

export const SongCardSkeleton: React.FC = () => {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl glass-panel animate-pulse">
      <div className="w-12 h-12 rounded-xl bg-white/10 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="w-3/4 h-3.5 bg-white/10 rounded-full" />
        <div className="w-1/2 h-2.5 bg-white/5 rounded-full" />
      </div>
      <div className="w-6 h-6 rounded-full bg-white/5" />
    </div>
  );
};

export const AlbumCardSkeleton: React.FC = () => {
  return (
    <div className="w-40 shrink-0 p-3 rounded-3xl glass-panel animate-pulse space-y-3">
      <div className="w-full aspect-square rounded-2xl bg-white/10" />
      <div className="space-y-1.5">
        <div className="w-4/5 h-3 bg-white/10 rounded-full" />
        <div className="w-3/5 h-2.5 bg-white/5 rounded-full" />
      </div>
    </div>
  );
};

export const ArtistCardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col items-center gap-2 p-3 rounded-3xl glass-panel animate-pulse w-28 shrink-0">
      <div className="w-20 h-20 rounded-full bg-white/10" />
      <div className="w-16 h-3 bg-white/10 rounded-full" />
      <div className="w-10 h-2 bg-white/5 rounded-full" />
    </div>
  );
};

export const SpeedDialSkeleton: React.FC = () => (
  <div className="grid grid-cols-3 gap-3 animate-pulse">
    {Array.from({ length: 9 }).map((_, i) => (
      <div key={i} className="space-y-2">
        <div className="aspect-square rounded-[20px] bg-white/10" />
        <div className="h-3 w-3/4 rounded-full bg-white/10" />
      </div>
    ))}
  </div>
);
