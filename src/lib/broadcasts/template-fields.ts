import type { MessageTemplate } from "@/types";
import { extractVariableIndices } from "@/lib/whatsapp/template-validators";

export type CampaignButtonSlot = {
  index: number;
  label: string;
  kind: "url" | "copy_code";
};

export function countBodyVars(template: MessageTemplate | null): number {
  if (!template?.body_text) return 0;
  return extractVariableIndices(template.body_text).length;
}

export function needsHeaderText(template: MessageTemplate | null): boolean {
  if (!template || template.header_type !== "text" || !template.header_content) {
    return false;
  }
  return extractVariableIndices(template.header_content).length > 0;
}

export function buttonSlots(template: MessageTemplate | null): CampaignButtonSlot[] {
  if (!template?.buttons?.length) return [];
  const slots: CampaignButtonSlot[] = [];
  template.buttons.forEach((b, i) => {
    if (b.type === "URL" && extractVariableIndices(b.url).length > 0) {
      slots.push({ index: i, label: b.text || `URL button ${i + 1}`, kind: "url" });
    } else if (b.type === "COPY_CODE") {
      slots.push({
        index: i,
        label: b.text || `Copy code ${i + 1}`,
        kind: "copy_code",
      });
    }
  });
  return slots;
}

/** Fill body {{n}} placeholders for a simple text preview. */
export function fillBodyPreview(
  bodyText: string,
  params: string[],
): string {
  return bodyText.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => {
    const idx = Number(n) - 1;
    const v = params[idx];
    return v && v.trim() ? v : `{{${n}}}`;
  });
}

export function requiredVarsFilled(
  template: MessageTemplate | null,
  bodyParams: string[],
  headerText: string,
  buttonParams: Record<number, string>,
): boolean {
  if (!template) return false;
  const n = countBodyVars(template);
  for (let i = 0; i < n; i++) {
    if (!String(bodyParams[i] ?? "").trim()) return false;
  }
  if (needsHeaderText(template) && !headerText.trim()) return false;
  for (const slot of buttonSlots(template)) {
    if (slot.kind === "url" && !String(buttonParams[slot.index] ?? "").trim()) {
      return false;
    }
  }
  return true;
}
