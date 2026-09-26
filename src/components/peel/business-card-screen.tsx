"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
} from "@/components/ui/card";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { useSize } from "@/lib/size-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Decal } from "@/data/decals";
import {
  CARD,
  CORNER_MM,
  MIN_MODULE_MM,
  cardStyles,
  cardFileName,
  checkCard,
  exampleCard,
  formatEmail,
  formatLinkedin,
  formatPhone,
  layoutCard,
  officeAddress,
  offices,
  type CardDesign,
  type CardField,
  type CardFields,
} from "@/lib/business-card";
import { exportBusinessCard } from "@/lib/business-card-pdf";
import { backSvg, frontSvg } from "@/lib/business-card-svg";
import { formatSize } from "@/lib/units";
import { useTypeScale } from "@/lib/size-context";
import { DetailsTable, SectionHeading, SizeValue } from "./decal-details";
import { BusinessCardPreview } from "./business-card-preview";
import { DownloadIsland } from "./download-island";
import { ScreenLayout } from "./screen-layout";
import { StyleSwatches } from "./style-swatches";
import { useBuild } from "./use-build";
import { useUnits } from "./units-menu";

// Business card builder (variant B): the 3D preview on top with the design under
// the card (style swatches, rounded corners), the form under it (what's printed,
// what goes only into the QR code), the Download panel holds just the file. Native InputGroup / InputField; the details stay in this
// browser — nothing is sent or saved.

type FieldSpec = {
  key: CardField;
  label: string;
  optional?: boolean;
  placeholder: string;
  autoComplete: string;
  inputMode?: "email" | "tel" | "url";
};

const PRINTED_FIELDS: FieldSpec[] = [
  { key: "name", label: "Name", placeholder: exampleCard.name, autoComplete: "name" },
  { key: "role", label: "Role", placeholder: exampleCard.role, autoComplete: "organization-title" },
  { key: "email", label: "Email", placeholder: exampleCard.email, autoComplete: "email", inputMode: "email" },
  { key: "phone", label: "Phone", optional: true, placeholder: exampleCard.phone, autoComplete: "tel", inputMode: "tel" },
];

const ADDRESS_FIELD: FieldSpec = { key: "address", label: "Address", placeholder: "Street, city, state, ZIP", autoComplete: "street-address" };
const LINKEDIN_FIELD: FieldSpec = { key: "linkedin", label: "LinkedIn", optional: true, placeholder: "Profile link or handle", autoComplete: "url", inputMode: "url" };

/** Office choices: none, the offices, a free-form address. */
const OFFICE_OPTIONS = [
  { value: "none", label: "No address" },
  ...offices.map((o) => ({ value: o.id, label: `${o.name} office` })),
  { value: "other", label: "Other address" },
];

export function BusinessCardBody({
  decal,
  fields,
  onFieldsChange,
  design,
  onDesignChange,
  header,
}: {
  decal: Decal;
  fields: CardFields;
  onFieldsChange: (fields: CardFields) => void;
  design: CardDesign;
  onDesignChange: (design: CardDesign) => void;
  header: ReactNode;
}) {
  const build = useBuild();
  const units = useUnits();
  const type = useTypeScale();
  const size = useSize();
  // Fields the person has left: unfinished values show their error from then on
  const [touched, setTouched] = useState<ReadonlySet<CardField>>(new Set());
  const { errors, complete } = checkCard(fields, touched);

  // Preview: nothing on the card yet — the example; otherwise the entered values,
  // with empty required fields filled by the example in grey
  const printed: CardField[] = ["name", "role", "email", "phone"];
  const isExample = printed.every((k) => !fields[k].trim());
  // QR-only fields (office, address, LinkedIn) always come from the form
  const shown: CardFields = isExample
    ? { ...exampleCard, office: fields.office, address: fields.address, linkedin: fields.linkedin }
    : {
        ...fields,
        name: fields.name.trim() ? fields.name : exampleCard.name,
        role: fields.role.trim() ? fields.role : exampleCard.role,
        email: fields.email.trim() ? fields.email : exampleCard.email,
      };
  const hinted = new Set<CardField>(
    isExample ? [] : printed.filter((k) => k !== "phone" && !fields[k].trim()),
  );
  const layout = layoutCard(shown);
  const { qr } = layout;
  const dense = qr.moduleMm < MIN_MODULE_MM;

  const front = useMemo(() => frontSvg(design), [design]);
  const back = backSvg(layout, hinted, design);
  const style = cardStyles[design.style];
  const setDesign = (next: Partial<CardDesign>) => {
    build.reset();
    onDesignChange({ ...design, ...next });
  };

  const set = (key: CardField, value: string) => {
    build.reset();
    onFieldsChange({ ...fields, [key]: value });
  };

  // Phone, email and LinkedIn are reformatted as you type. The caret keeps its
  // place instead of jumping to the end: among the digits (phone), before the
  // domain (email).
  const form = useRef<HTMLDivElement>(null);
  const caret = useRef<
    { field: "phone"; digits: number } | { field: "email"; index: number } | null
  >(null);
  useLayoutEffect(() => {
    const c = caret.current;
    if (!c) return;
    caret.current = null;
    const input = form.current?.querySelector<HTMLInputElement>(`input[name="${c.field}"]`);
    if (!input || document.activeElement !== input) return;
    let pos = 0;
    if (c.field === "phone") {
      for (let seen = 0; pos < input.value.length && seen < c.digits; pos++)
        if (/\d/.test(input.value[pos])) seen++;
    } else {
      // Never inside the fixed domain
      const at = input.value.indexOf("@");
      pos = Math.min(c.index, at < 0 ? input.value.length : at);
    }
    input.setSelectionRange(pos, pos);
  });
  const onPhone = (typed: string) => {
    const input = document.activeElement as HTMLInputElement | null;
    let next = typed;
    let at = input?.selectionStart ?? next.length;
    const digitsOf = (v: string) => v.replace(/\D/g, "");
    // Backspace over a space or a bracket removes the digit before it — otherwise
    // the formatting would put the character straight back
    if (next.length < fields.phone.length && digitsOf(next) === digitsOf(fields.phone)) {
      const head = next.slice(0, at).replace(/\d(?=\D*$)/, "");
      next = head + next.slice(at);
      at = head.length;
    }
    const formatted = formatPhone(next);
    // A typed digit without a plus gets +1 in front: the caret moves past it too
    const added = Math.max(0, digitsOf(formatted).length - digitsOf(next).length);
    caret.current = { field: "phone", digits: digitsOf(next.slice(0, at)).length + added };
    set("phone", formatted);
  };
  const onChange = (key: CardField, value: string) => {
    if (key === "phone") onPhone(value);
    else if (key === "email") {
      const input = document.activeElement as HTMLInputElement | null;
      caret.current = { field: "email", index: input?.selectionStart ?? value.length };
      set(key, formatEmail(value, fields.email));
    } else if (key === "linkedin") set(key, formatLinkedin(value, fields.linkedin));
    else set(key, value);
  };
  // A native InputField with its label hidden: the row shows the label. Pulled
  // left by its inner padding so the text lines up with the Details values.
  const field = (f: FieldSpec, index: number) => (
    <InputField
      index={index}
      label={f.label}
      labelHidden
      className={size.variant === "compact" ? "-ml-2" : "-ml-2.5"}
      placeholder={f.placeholder}
      name={f.key}
      value={fields[f.key]}
      onChange={(v) => onChange(f.key, v)}
      error={errors[f.key]}
      autoComplete={f.autoComplete}
      inputMode={f.inputMode}
      spellCheck={false}
    />
  );
  const rows = (specs: FieldSpec[]) =>
    specs.map((f, i) => (
      <FieldRow key={f.key} label={f.label} optional={f.optional}>
        {field(f, i)}
      </FieldRow>
    ));
  const caption = (text: string, tone = "text-muted-foreground") => (
    <p className={tone} style={{ fontSize: type.caption }}>
      {text}
    </p>
  );

  const office = offices.find((o) => o.id === fields.office);
  const fileName = cardFileName(decal.id, fields, design.style);
  const bleeds = CARD.bleedMm * 2;

  return (
    <ScreenLayout
      header={header}
      preview={
        <BusinessCardPreview
          label={isExample ? "Example" : "Preview"}
          sizeLabel={formatSize(CARD.widthMm, CARD.heightMm, units, 1)}
          front={front}
          back={back}
          rounded={design.rounded}
          // Design right under the card it changes: style swatches on the left,
          // rounded corners on the right of the Front / Back tabs
          footerStart={
            <StyleSwatches
              value={design.style}
              onChange={(style) => setDesign({ style })}
            />
          }
          footerEnd={
            <Switch
              className="px-0"
              label="Rounded corners"
              checked={design.rounded}
              onToggle={() => setDesign({ rounded: !design.rounded })}
            />
          }
        />
      }
      controls={
        // CUSTOM: browser autofill sends a keydown without a key, and the
        // sidebar shortcut listener (sidebar-core, on window) crashes on it —
        // such events stop here, before they bubble up
        <div
          ref={form}
          className="flex flex-col gap-8"
          onKeyDown={(e) => {
            if (!e.nativeEvent.key) e.stopPropagation();
          }}
          // Leaving a field marks it touched (blur bubbles in React)
          onBlur={(e) => {
            const name = (e.target as HTMLInputElement).name as CardField;
            if (name && !touched.has(name)) setTouched(new Set(touched).add(name));
          }}
        >
          {/* The fields sit in outlined cards (Fluid CardGroup border="outlined":
              the page background, a hairline frame), apart from the read-only
              Details. Label — field rows inside, like Details; fluid hover runs
              over the whole group (InputGroup). */}
          <FormCard title="On the card">
            <InputGroup className="w-full gap-0">{rows(PRINTED_FIELDS)}</InputGroup>
          </FormCard>
          <FormCard
            title="In the QR code"
            description="The QR code saves a contact card: everything above, plus the fields below and avride.ai."
          >
            <InputGroup className="w-full gap-0">
              {/* Address: an office (its address goes in field by field) or a
                  free-form one; native borderless Select */}
              <FieldRow label="Address" optional>
                <div className="flex flex-col items-start">
                  <Select
                    value={fields.office || "none"}
                    onValueChange={(v) =>
                      set("office", (v as string) === "none" ? "" : (v as string))
                    }
                  >
                    <SelectTrigger
                      variant="borderless"
                      className={`min-w-0 ${size.variant === "compact" ? "-ml-2" : "-ml-2.5"}`}
                    />
                    <SelectContent>
                      {OFFICE_OPTIONS.map((o, i) => (
                        <SelectItem key={o.value} index={i} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* The chosen office's address, as it goes into the contact */}
                  {office && (
                    <p
                      className="pb-1.5 text-muted-foreground"
                      style={{ fontSize: type.caption }}
                    >
                      {officeAddress(office)}
                    </p>
                  )}
                  {fields.office === "other" && (
                    <div className="w-full pb-1">{field(ADDRESS_FIELD, 0)}</div>
                  )}
                </div>
              </FieldRow>
              <FieldRow label={LINKEDIN_FIELD.label} optional>
                {field(LINKEDIN_FIELD, 1)}
              </FieldRow>
            </InputGroup>
            {dense &&
              caption(
                `The QR code is getting dense: ${qr.moduleMm.toFixed(2)} mm modules. Leave out the address or LinkedIn so phones read it reliably.`,
                "text-destructive",
              )}
          </FormCard>
        </div>
      }
      details={
        <DetailsTable
          rows={[
            [
              "Size",
              <SizeValue
                key="size"
                main={formatSize(CARD.widthMm, CARD.heightMm, units, 1)}
                sub={`With bleed ${formatSize(CARD.widthMm + bleeds, CARD.heightMm + bleeds, units, 1)}`}
              />,
            ],
            ["Production", "Print"],
            ["Material", decal.material ?? "—"],
            ["Print", style.print],
            ["Sides", "Front and back"],
            [
              "Corners",
              design.rounded
                ? // Dies are named in inches; the radius in mm alongside
                  `Rounded, 1/8 in radius (${CORNER_MM.toFixed(1)} mm) · die cut`
                : "Square",
            ],
            [
              "QR code",
              `${qr.modules} × ${qr.modules} modules · ${qr.moduleMm.toFixed(2)} mm each`,
            ],
          ]}
        />
      }
      island={
        <DownloadIsland
          items={1}
          mode="pdf"
          onModeChange={() => {}}
          caption="Your details stay in this browser."
          disabled={!complete}
          build={build}
          onDownload={() =>
            void build.start({
              kind: "generate",
              total: 1,
              run: () => exportBusinessCard(fields, design, fileName),
            })
          }
        />
      }
    />
  );
}

// CUSTOM: a form row in the Details table's pattern (DetailsTable): the label in
// a 10rem column (6.5rem on a phone), the control on the right, a border-token divider at 60%. Label
// size and colour from the Fluid scale; "optional" in a lighter tone.
export function FieldRow({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  const size = useSize();
  return (
    <div
      // A narrower label column on a phone, so the field keeps its room
      className={`grid grid-cols-[minmax(0,6.5rem)_1fr] items-start border-b border-border/60 py-1 last:border-b-0 sm:grid-cols-[minmax(0,10rem)_1fr] ${size.gap}`}
    >
      {/* pt centers the label on the 36 / 28 px control */}
      <span
        className={`${size.text} text-muted-foreground ${size.variant === "compact" ? "pt-1.5" : "pt-2"}`}
      >
        {label}
        {optional && <span className="text-muted-foreground/60"> · optional</span>}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// A group of fields: native outlined CardGroup and Card. The title is the same
// heading as Details (SectionHeading) instead of CardTitle, the note below it.
export function FormCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    // As wide as the preview card; the text sits on the card padding, in line
    // with the preview's text and the Details below
    <CardGroup fluidHover={false} border="outlined" className="rounded-xl">
      <Card>
        <CardHeader>
          <SectionHeading>{title}</SectionHeading>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </CardGroup>
  );
}
