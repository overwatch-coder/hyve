import { useState } from "react";
import {
  Hexagon,
  Activity,
  Github,
  Linkedin,
  Twitter,
  Globe,
  Sparkles,
  Code2,
  Brain,
  BarChart2,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────── */
interface Social {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface Member {
  name: string;
  role: string;
  tagline: string;
  bio: string;
  skills: string[];
  roleIcon: React.ElementType;
  social: Social[];
  /** Tailwind gradient classes for the avatar ring */
  gradient: string;
  /** Initials shown inside avatar placeholder */
  initials: string;
  /**
   * Path to headshot photo (relative to /public).
   * Drop a real image at this path to replace the gradient placeholder.
   * Falls back to the gradient+initials avatar if the image fails to load.
   */
  photo: string;
}

/* ──────────────────────────────────────────────────
   Team Data (placeholder — replace with real info)
   ────────────────────────────────────────────────── */
const TEAM: Member[] = [
  {
    name: "Makinde Mark Olusanya",
    role: "AI & Backend Lead",
    tagline: "Turning raw reviews into structured intelligence",
    bio: "Makinde architects the AI pipeline at the heart of HYVE — from multi-step LLM prompting to theme extraction and sentiment scoring. With a background in NLP and distributed systems, they ensure the analysis is fast, accurate, and production-ready.",
    skills: ["Python", "LLM Orchestration", "FastAPI", "PostgreSQL", "NLP"],
    roleIcon: Brain,
    gradient: "from-primary via-violet-500 to-indigo-500",
    initials: "MM",
    photo: "/avatars/makinde.jpg",
    social: [
      { label: "GitHub", href: "https://github.com/placeholder", icon: Github },
      {
        label: "LinkedIn",
        href: "https://linkedin.com/in/placeholder",
        icon: Linkedin,
      },
      {
        label: "Twitter / X",
        href: "https://x.com/placeholder",
        icon: Twitter,
      },
    ],
  },
  {
    name: "Adeola Okikiola",
    role: "Frontend & UX Lead",
    tagline: "Crafting the interface where data becomes clarity",
    bio: "Adeola transforms complex analytical output into the interactive decision maps users love. Passionate about motion design and accessibility, they own everything from the React component library to the Joyride onboarding experience.",
    skills: [
      "React",
      "TypeScript",
      "Tailwind CSS",
      "React Flow",
      "Framer Motion",
    ],
    roleIcon: Layers,
    gradient: "from-sky-500 via-blue-500 to-cyan-500",
    initials: "AO",
    photo: "/avatars/adeola.jpg",
    social: [
      { label: "GitHub", href: "https://github.com/placeholder", icon: Github },
      {
        label: "LinkedIn",
        href: "https://linkedin.com/in/placeholder",
        icon: Linkedin,
      },
      { label: "Portfolio", href: "https://placeholder.dev", icon: Globe },
    ],
  },
  {
    name: "John Edikan",
    role: "Data & Research Lead",
    tagline: "Evidence-first design, every decision validated",
    bio: "John drives the data strategy behind HYVE which is designing the A/B experiments, analysing participant results, and ensuring every feature is grounded in user research. Their work proves HYVE genuinely helps people decide faster and with more confidence.",
    skills: [
      "Data Analysis",
      "A/B Testing",
      "Python",
      "User Research",
      "Statistics",
    ],
    roleIcon: BarChart2,
    gradient: "from-emerald-500 via-teal-500 to-green-500",
    initials: "JE",
    photo: "/avatars/john.jpg",
    social: [
      { label: "GitHub", href: "https://github.com/placeholder", icon: Github },
      {
        label: "LinkedIn",
        href: "https://linkedin.com/in/placeholder",
        icon: Linkedin,
      },
      {
        label: "Twitter / X",
        href: "https://x.com/placeholder",
        icon: Twitter,
      },
    ],
  },
  {
    name: "Atsu Nyamadi",
    role: "Full-Stack & DevOps Lead",
    tagline: "Shipping HYVE reliably from dev to production",
    bio: "Atsu keeps the entire stack humming — from Docker and CI/CD pipelines to AWS deployment and database migrations. They bridge the frontend and backend teams, resolving integration issues and owning the infrastructure that makes HYVE available 24/7.",
    skills: ["Docker", "AWS", "CI/CD", "Node.js", "PostgreSQL"],
    roleIcon: Code2,
    gradient: "from-amber-500 via-orange-500 to-red-500",
    initials: "AN",
    photo: "/avatars/atsu.jpg",
    social: [
      { label: "GitHub", href: "https://github.com/placeholder", icon: Github },
      {
        label: "LinkedIn",
        href: "https://linkedin.com/in/placeholder",
        icon: Linkedin,
      },
      { label: "Portfolio", href: "https://placeholder.dev", icon: Globe },
    ],
  },
];

/* ──────────────────────────────────────────────────
   Member Avatar — photo with initials fallback
   ────────────────────────────────────────────────── */
function MemberAvatar({
  member,
  size = "lg",
}: {
  member: Pick<Member, "name" | "initials" | "gradient" | "photo">;
  size?: "sm" | "lg";
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const sizeClasses =
    size === "lg" ? "h-28 w-28 text-3xl" : "h-10 w-10 text-sm";

  if (!imgFailed) {
    return (
      <img
        src={member.photo}
        alt={member.name}
        onError={() => setImgFailed(true)}
        className={cn(
          "rounded-full object-cover object-top shrink-0 select-none",
          sizeClasses,
        )}
      />
    );
  }

  // Fallback: gradient initials pill
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-black text-white select-none shrink-0",
        `bg-gradient-to-br ${member.gradient}`,
        sizeClasses,
      )}
    >
      {member.initials}
    </div>
  );
}

/* ──────────────────────────────────────────────────
   Member Card
   ────────────────────────────────────────────────── */
function MemberCard({ member }: { member: Member }) {
  const [hovered, setHovered] = useState(false);
  const RoleIcon = member.roleIcon;

  return (
    <Card
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative overflow-hidden border border-border/40 transition-all duration-300 group",
        hovered
          ? "border-primary/40 shadow-xl shadow-primary/10 -translate-y-1"
          : "shadow-md",
      )}
    >
      {/* Subtle glow backdrop */}
      <div
        className={cn(
          "absolute inset-0 opacity-0 transition-opacity duration-500 pointer-events-none",
          `bg-gradient-to-br ${member.gradient}`,
          hovered ? "opacity-[0.04]" : "",
        )}
      />

      {/* Top accent bar */}
      <div className={cn("h-1 w-full bg-gradient-to-r", member.gradient)} />

      <CardContent className="p-6 flex flex-col gap-5">
        {/* Header: avatar + name/role */}
        <div className="flex items-center gap-4">
          {/* Avatar with ring */}
          <div
            className={cn(
              "p-0.5 rounded-full bg-gradient-to-br transition-all duration-300",
              member.gradient,
              hovered ? "ring-4 ring-primary/20" : "",
            )}
          >
            <MemberAvatar member={member} size="sm" />
          </div>

          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="font-black text-base leading-tight truncate">
              {member.name}
            </p>
            <div className="flex items-center gap-1.5">
              <RoleIcon className="h-3 w-3 text-primary shrink-0" />
              <p className="text-xs font-semibold text-primary truncate">
                {member.role}
              </p>
            </div>
          </div>
        </div>

        {/* Tagline */}
        <p className="text-sm italic text-muted-foreground leading-snug border-l-2 border-primary/30 pl-3">
          "{member.tagline}"
        </p>

        {/* Bio */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {member.bio}
        </p>

        {/* Skills */}
        <div className="flex flex-wrap gap-1.5">
          {member.skills.map((skill) => (
            <Badge
              key={skill}
              variant="secondary"
              className="text-[10px] px-2 py-0.5 font-semibold"
            >
              {skill}
            </Badge>
          ))}
        </div>

        {/* Social Links */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
          {member.social.map(({ label, href, icon: Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${member.name} on ${label}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors rounded-md px-2 py-1 hover:bg-primary/5"
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
              <ArrowUpRight className="h-2.5 w-2.5 opacity-50" />
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ──────────────────────────────────────────────────
   Large Avatar Row (hero section)
   ────────────────────────────────────────────────── */
function HeroAvatarStack() {
  return (
    <div className="flex items-center justify-center">
      <div className="flex -space-x-4">
        {TEAM.map((m, i) => (
          <div
            key={m.name}
            className={cn(
              "p-0.5 rounded-full bg-gradient-to-br ring-2 ring-background",
              m.gradient,
            )}
            style={{ zIndex: TEAM.length - i }}
          >
            <MemberAvatar member={m} size="lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────── */
export default function Team() {
  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-12 animate-fade-in">
      {/* ── Hero ── */}
      <section className="flex flex-col items-center text-center gap-6 pt-6">
        {/* Brand icon */}
        <div className="relative">
          <Hexagon className="h-14 w-14 text-primary fill-primary/10" />
          <Activity className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
            Team Spider
          </span>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            The people behind <span className="text-primary">HYVE</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed mt-1">
            Four curious minds who believe shopping decisions should be driven
            by data, not by scrolling through thousands of reviews.
          </p>
        </div>

        <HeroAvatarStack />

        {/* Stat strip */}
        <div className="grid grid-cols-3 gap-4 sm:gap-8 w-full max-w-lg mt-2">
          {[
            { value: "4", label: "Team members" },
            { value: "1", label: "Shared vision" },
            { value: "∞", label: "Reviews analysed" },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <span className="text-2xl sm:text-3xl font-black text-primary">
                {value}
              </span>
              <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Mission Banner ── */}
      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 px-6 py-8 sm:px-10 text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5 pointer-events-none" />
        <Sparkles className="h-6 w-6 text-primary mx-auto mb-3" />
        <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-2">
          Our Mission
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed text-sm sm:text-base">
          We built HYVE because we believe everyone deserves to make confident
          purchasing decisions — without wading through noise. By transforming
          unstructured review text into structured visual intelligence, we give
          shoppers, researchers, and businesses a clear picture of what people
          really think.
        </p>
      </section>

      {/* ── Team Grid ── */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-black tracking-tight">Meet the team</h2>
          <div className="flex-1 h-px bg-border/60" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {TEAM.map((member) => (
            <MemberCard key={member.name} member={member} />
          ))}
        </div>
      </section>

      {/* ── Values Strip ── */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Brain, label: "AI-first thinking" },
          { icon: BarChart2, label: "Data-driven decisions" },
          { icon: Layers, label: "Clean experiences" },
          { icon: Code2, label: "Production-grade code" },
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/40 bg-card hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 text-center"
          >
            <Icon className="h-5 w-5 text-primary" />
            <p className="text-xs font-bold text-muted-foreground leading-snug">
              {label}
            </p>
          </div>
        ))}
      </section>

      {/* ── Footer note ── */}
      <p className="text-center text-xs text-muted-foreground/60 pb-4">
        Team Spider · UM6P Coding · HYVE v1.0.0
      </p>
    </div>
  );
}
