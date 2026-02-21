import React from 'react';
export const FieldInfo = ({ error, hint }: any) => (
  <div className="min-h-[16px] mt-1">
    {error ? <p className="text-[10px] text-red-500 font-bold">⚠ {error}</p> : <p className="text-[10px] text-slate-400">{hint}</p>}
  </div>
);
