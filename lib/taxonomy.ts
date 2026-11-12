import type { SkillCategory } from "./schemas";

export interface TaxonomyEntry {
  canonicalName: string;
  category: SkillCategory;
  aliases: string[];
}

export const SKILL_TAXONOMY: TaxonomyEntry[] = [
  // LCA Software
  {
    canonicalName: "GaBi",
    category: "lca_software",
    aliases: [
      "gabi",
      "gabi ts",
      "sphera gabi",
      "sphera lca",
      "thinkstep gabi",
      "gabi software",
      "lca for experts",
    ],
  },
  {
    canonicalName: "SimaPro",
    category: "lca_software",
    aliases: [
      "simapro",
      "sima pro",
      "simapro 9",
      "simapro 8",
      "simapro 9.5",
      "pre sustainability simapro",
    ],
  },
  {
    canonicalName: "OpenLCA",
    category: "lca_software",
    aliases: ["openlca", "open lca", "greendelta openlca"],
  },
  {
    canonicalName: "ecoinvent",
    category: "lca_software",
    aliases: ["ecoinvent", "eco invent", "ecoinvent database", "ecoinvent 3"],
  },
  {
    canonicalName: "Umberto",
    category: "lca_software",
    aliases: ["umberto", "umberto lca"],
  },
  {
    canonicalName: "One Click LCA",
    category: "lca_software",
    aliases: ["one click lca", "oneclick lca", "one-click lca"],
  },
  {
    canonicalName: "GREET",
    category: "lca_software",
    aliases: ["greet model", "argonne greet"],
  },

  // LCA Methodology & Standards
  {
    canonicalName: "Life Cycle Assessment (LCA)",
    category: "lca_methodology_standard",
    aliases: [
      "life cycle assessment",
      "lifecycle assessment",
      "life-cycle assessment",
      "lca",
      "lca study",
      "lca studies",
      "lca modelling",
      "lca modeling",
      "cradle to grave",
      "cradle-to-grave",
      "cradle to gate",
      "cradle-to-gate",
    ],
  },
  {
    canonicalName: "Life Cycle Inventory (LCI)",
    category: "lca_methodology_standard",
    aliases: [
      "life cycle inventory",
      "lifecycle inventory",
      "lci",
      "lci data",
      "lci dataset",
      "lci datasets",
      "lci model",
      "inventory modeling",
    ],
  },
  {
    canonicalName: "ISO 14040",
    category: "lca_methodology_standard",
    aliases: ["iso 14040", "iso14040", "iso-14040", "iso 14040:2006"],
  },
  {
    canonicalName: "ISO 14044",
    category: "lca_methodology_standard",
    aliases: ["iso 14044", "iso14044", "iso-14044", "iso 14044:2006"],
  },
  {
    canonicalName: "EPD",
    category: "lca_methodology_standard",
    aliases: [
      "epd",
      "environmental product declaration",
      "environmental product declarations",
      "iso 14025",
    ],
  },
  {
    canonicalName: "LCIA",
    category: "lca_methodology_standard",
    aliases: [
      "lcia",
      "life cycle impact assessment",
      "recipe",
      "cml",
      "traci",
      "impact assessment",
    ],
  },
  {
    canonicalName: "ISO 14067 / PCF",
    category: "lca_methodology_standard",
    aliases: ["iso 14067", "iso14067", "product carbon footprint", "pcf"],
  },
  {
    canonicalName: "GHG Protocol / ISO 14064",
    category: "lca_methodology_standard",
    aliases: [
      "ghg protocol",
      "greenhouse gas protocol",
      "iso 14064",
      "ghg accounting",
      "scope 1",
      "scope 2",
      "scope 3",
    ],
  },
  {
    canonicalName: "Data Validation & QC",
    category: "lca_methodology_standard",
    aliases: [
      "data validation",
      "lci validation",
      "data quality",
      "quality control",
      "pedigree matrix",
      "sensitivity analysis",
      "uncertainty analysis",
    ],
  },
  {
    canonicalName: "Public Benchmarking",
    category: "lca_methodology_standard",
    aliases: [
      "benchmarking",
      "public benchmarking",
      "industry benchmarking",
      "peer benchmarking",
    ],
  },
  {
    canonicalName: "Operational & Logistics Data",
    category: "lca_methodology_standard",
    aliases: [
      "logistics data",
      "inbound",
      "outbound",
      "supplier logistics",
      "plant level",
      "bill of materials",
      "bills of material",
      "bom",
      "material flow",
      "energy audit",
      "supply chain emissions",
    ],
  },

  // Sustainability Domain & Preferred JD1
  {
    canonicalName: "Carbon Footprint",
    category: "sustainability_domain",
    aliases: [
      "carbon footprint",
      "carbon accounting",
      "decarbonization",
      "net zero",
      "net-zero",
      "emissions inventory",
      "climate change",
      "climate risk",
      "climate action",
    ],
  },
  {
    canonicalName: "ESG & Sustainability Reporting",
    category: "sustainability_domain",
    aliases: [
      "esg",
      "sustainability reporting",
      "sustainability consulting",
      "gri",
      "cdp",
      "sbti",
      "brsr",
      "csrd",
    ],
  },
  {
    canonicalName: "Circular Economy",
    category: "sustainability_domain",
    aliases: [
      "circular economy",
      "cradle to cradle",
      "cradle-to-cradle",
      "waste management",
      "material flow analysis",
    ],
  },
  {
    canonicalName: "Business Finance & Accounting",
    category: "sustainability_domain",
    aliases: [
      "business finance",
      "financial accounting",
      "cost accounting",
      "financial modeling",
      "finance",
      "accounting",
    ],
  },
  {
    canonicalName: "Stakeholder Management",
    category: "sustainability_domain",
    aliases: [
      "stakeholder management",
      "client management",
      "cross-functional",
      "cross functional",
      "cft",
    ],
  },

  // UI/UX Tools
  {
    canonicalName: "Figma",
    category: "uiux_tool",
    aliases: [
      "figma",
      "figjam",
      "figma prototyping",
      "figma auto layout",
      "auto-layout",
    ],
  },
  {
    canonicalName: "Adobe XD",
    category: "uiux_tool",
    aliases: ["adobe xd", "xd"],
  },
  {
    canonicalName: "Sketch",
    category: "uiux_tool",
    aliases: ["sketch app", "sketch"],
  },
  {
    canonicalName: "Framer",
    category: "uiux_tool",
    aliases: ["framer", "framer motion"],
  },
  {
    canonicalName: "Penpot",
    category: "uiux_tool",
    aliases: ["penpot"],
  },
  {
    canonicalName: "Webflow",
    category: "uiux_tool",
    aliases: ["webflow"],
  },
  {
    canonicalName: "ProtoPie",
    category: "uiux_tool",
    aliases: ["protopie"],
  },
  {
    canonicalName: "Miro",
    category: "uiux_tool",
    aliases: ["miro"],
  },
  {
    canonicalName: "Canva",
    category: "uiux_tool",
    aliases: ["canva"],
  },
  {
    canonicalName: "Adobe Creative Suite",
    category: "uiux_tool",
    aliases: [
      "adobe photoshop",
      "photoshop",
      "adobe illustrator",
      "illustrator",
      "adobe creative suite",
      "indesign",
      "after effects",
    ],
  },

  // UI/UX Methodology
  {
    canonicalName: "UI/UX Design",
    category: "uiux_methodology",
    aliases: [
      "ui/ux",
      "ux/ui",
      "ui ux",
      "ux ui",
      "ui/ux design",
      "ux/ui design",
      "user interface",
      "user experience",
      "product design",
      "interaction design",
      "ui design",
      "ux design",
    ],
  },
  {
    canonicalName: "Prototyping",
    category: "uiux_methodology",
    aliases: [
      "prototyping",
      "high-fidelity prototyping",
      "high fidelity prototypes",
      "interactive prototypes",
      "clickable prototype",
      "prototypes",
      "prototype",
    ],
  },
  {
    canonicalName: "Wireframing",
    category: "uiux_methodology",
    aliases: [
      "wireframing",
      "wireframes",
      "wireframe",
      "low-fidelity",
      "lo-fi",
    ],
  },
  {
    canonicalName: "User Research",
    category: "uiux_methodology",
    aliases: [
      "user research",
      "ux research",
      "user interviews",
      "contextual inquiry",
      "qualitative research",
      "user surveys",
    ],
  },
  {
    canonicalName: "Usability Testing",
    category: "uiux_methodology",
    aliases: [
      "usability testing",
      "user testing",
      "a/b testing",
      "heuristic evaluation",
      "usability",
    ],
  },
  {
    canonicalName: "User Psychology & HCD",
    category: "uiux_methodology",
    aliases: [
      "user psychology",
      "cognitive psychology",
      "behavioral design",
      "user behavior",
      "human-centered design",
      "human centered design",
      "user-centered design",
      "user centered design",
      "design thinking",
      "empathy mapping",
      "user persona",
      "personas",
    ],
  },
  {
    canonicalName: "Information Architecture",
    category: "uiux_methodology",
    aliases: [
      "information architecture",
      "user flows",
      "user flow",
      "user journey",
      "journey mapping",
      "card sorting",
      "sitemap",
    ],
  },
  {
    canonicalName: "Design Systems & Visual Design",
    category: "uiux_methodology",
    aliases: [
      "design system",
      "design systems",
      "visual design",
      "visual identity",
      "design language",
      "style guide",
      "component library",
      "typography",
      "color theory",
      "accessibility",
      "wcag",
    ],
  },
  {
    canonicalName: "Responsive Web & Product UI",
    category: "uiux_methodology",
    aliases: [
      "responsive design",
      "responsive web",
      "mobile-first",
      "mobile first",
      "web design",
      "landing page",
      "job board",
    ],
  },
  {
    canonicalName: "Design Critiques",
    category: "uiux_methodology",
    aliases: ["design critique", "design critiques", "design review"],
  },
];

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function aliasMatchesText(text: string, alias: string): boolean {
  const escaped = escapeRegExp(alias.toLowerCase());
  const pattern = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
  return pattern.test(text);
}

/**
 * Resolves a raw skill string to its canonical taxonomy entry if matched.
 */
export function resolveCanonicalSkill(
  rawSkill: string
): TaxonomyEntry | null {
  const normalized = rawSkill.trim().toLowerCase();
  if (!normalized) return null;

  // Exact alias match first
  for (const entry of SKILL_TAXONOMY) {
    if (
      entry.canonicalName.toLowerCase() === normalized ||
      entry.aliases.some((alias) => alias.toLowerCase() === normalized)
    ) {
      return entry;
    }
  }

  // Boundary match inside longer phrase (e.g. "SimaPro 9.5 LCA modeling")
  for (const entry of SKILL_TAXONOMY) {
    if (entry.aliases.some((alias) => aliasMatchesText(normalized, alias))) {
      return entry;
    }
  }

  return null;
}

