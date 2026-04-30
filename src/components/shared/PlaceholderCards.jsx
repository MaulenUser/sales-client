import React from "react";

export default function PlaceholderCards({ items }) {
  return (
    <>
      {items.map(([title, description]) => (
        <article
          key={title}
          className="bg-muted/15 flex flex-col p-5 rounded-xl border-2 border-dashed border-border/50 opacity-50"
        >
          <div className="w-7 h-7 rounded-lg bg-muted-foreground/15 text-muted-foreground flex items-center justify-center font-bold text-base leading-none mb-4">
            +
          </div>
          <strong
            className="text-[9px] font-bold uppercase text-foreground mb-2"
            style={{ letterSpacing: "0.15em" }}
          >
            {title}
          </strong>
          <p className="text-[10px] text-muted-foreground leading-relaxed">{description}</p>
        </article>
      ))}
    </>
  );
}
