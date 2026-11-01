import React, { useState, useEffect } from 'react';

const Avatar: React.FC<{ src?: string; name: string; size?: number }> = ({ src, name, size = 40 }) => {
  const [err, setErr] = useState(false);
  useEffect(() => setErr(false), [src]);
  return src && !err ? (
    <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setErr(true)} width={size} height={size}
      className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full bg-accent/25 text-accent font-bold flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      {(name[0] || '?').toUpperCase()}
    </span>
  );
};

export { Avatar };
