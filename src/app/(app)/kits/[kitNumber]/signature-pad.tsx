"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Eraser, PenLine, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearSignature, signKit } from "../actions";

/** Finger / stylus signature on a canvas, saved as a PNG data URL. */
export function SignaturePad({
  kitNumber,
  soldierName,
  signature,
}: {
  kitNumber: number;
  soldierName: string;
  signature: { data: string; signedAt: string; signedBy: string | null } | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [resigning, setResigning] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const showPad = !signature || resigning;

  // Size the canvas to its CSS box at device pixel ratio for crisp lines.
  useEffect(() => {
    if (!showPad) return;
    const canvas = canvasRef.current!;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, [showPad]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
    setHasInk(true);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const onUp = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const save = () =>
    start(async () => {
      const data = canvasRef.current!.toDataURL("image/png");
      const r = await signKit(kitNumber, data);
      setMessage({ ok: r.ok, text: r.message ?? "" });
      if (r.ok) {
        setResigning(false);
        setHasInk(false);
      }
    });

  if (!showPad && signature)
    return (
      <div className="flex flex-col gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimize */}
        <img src={signature.data} alt={`חתימת ${soldierName}`} className="h-32 w-full rounded-lg border bg-white object-contain" />
        <p className="text-muted-foreground text-sm">
          נחתם ב-{signature.signedAt}
          {signature.signedBy && ` · הוחתם ע"י ${signature.signedBy}`}
        </p>
        {message?.ok && <p className="text-success text-sm font-medium">{message.text}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setResigning(true)}>
            <RotateCcw />
            החתמה מחדש
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-danger"
            disabled={pending}
            onClick={() => start(async () => void (await clearSignature(kitNumber)))}
          >
            ביטול החתמה
          </Button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        אני, <span className="font-semibold">{soldierName}</span>, מאשר/ת כי קיבלתי את הציוד המפורט בטופס זה ואני אחראי/ת לו.
      </p>
      <canvas
        ref={canvasRef}
        aria-label="משטח חתימה"
        className="h-40 w-full touch-none rounded-lg border-2 border-dashed bg-white"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {message && !message.ok && <p className="text-danger text-sm">{message.text}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={save} disabled={!hasInk || pending}>
          <PenLine />
          {pending ? "שומר…" : "אישור חתימה"}
        </Button>
        <Button type="button" variant="outline" onClick={clear} disabled={!hasInk}>
          <Eraser />
          ניקוי
        </Button>
        {resigning && (
          <Button type="button" variant="ghost" onClick={() => setResigning(false)}>
            ביטול
          </Button>
        )}
      </div>
    </div>
  );
}
