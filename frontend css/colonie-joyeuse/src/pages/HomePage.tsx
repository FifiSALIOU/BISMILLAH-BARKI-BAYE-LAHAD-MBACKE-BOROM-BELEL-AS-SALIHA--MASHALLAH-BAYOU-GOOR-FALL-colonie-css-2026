import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LogIn, ShieldCheck, Users, Sparkles, Leaf, Flame, Compass, Music2, Star, Calendar, Phone, Mail, MapPin } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";

const heroImages = [
  "/images/home/hero-1.jpeg",
  "/images/home/hero-3.jpeg",
  "/images/home/hero-5.jpeg",
];

const heroCaptions = [
  "Toute la colonie réunie — Édition CSS",
  "Grande ronde dans le parc",
  "Aventures nautiques encadrées",
];

const engagementValues = [
  {
    title: "Sécurité absolue",
    description: "Encadrement professionnel certifié, présence médicale 24/7.",
    icon: ShieldCheck,
  },
  {
    title: "Esprit d'équipe",
    description: "Le partage et l'entraide au coeur de chaque journée.",
    icon: Users,
  },
  {
    title: "Souvenirs durables",
    description: "Des amitiés qui durent toute une vie.",
    icon: Sparkles,
  },
];

const activities = [
  {
    title: "Pleine nature",
    description: "Randonnées et découverte de la faune et de la flore.",
    image: "/images/home/activity-nature.jpeg",
    icon: Leaf,
    axis: "AXE 01",
    points: ["Exploration encadrée", "Sensibilisation à la nature"],
  },
  {
    title: "Feux de camp",
    description: "Soirées chants et contes sous les étoiles.",
    image: "/images/home/activity-camp.jpeg",
    icon: Flame,
    axis: "AXE 02",
    points: ["Veillées sécurisées", "Cohésion du groupe"],
  },
  {
    title: "Sports & aventure",
    description: "Canoe, escalade et activités encadrées.",
    image: "/images/home/activity-sport.jpeg",
    icon: Compass,
    axis: "AXE 03",
    points: ["Activités dynamiques", "Encadrement qualifié"],
  },
  {
    title: "Ateliers créatifs",
    description: "Musique, arts et théâtre pour éveiller l'imagination.",
    image: "/images/home/activity-creative.jpeg",
    icon: Music2,
    axis: "AXE 04",
    points: ["Expression artistique", "Développement créatif"],
  },
];

const programAxes = [
  {
    axis: "AXE 01",
    title: "NATURE & AVENTURE",
    description: "Randonnées encadrées, bivouacs et découverte du milieu naturel.",
    bullets: ["Randonnées guidées", "Bivouac & feu de camp", "Initiation faune & flore"],
    image: "/images/home/activity-nature.jpeg",
    icon: Leaf,
  },
  {
    axis: "AXE 02",
    title: "SPORT & JEUX COLLECTIFS",
    description: "Tournois, activités nautiques et jeux d'équipe quotidiens.",
    bullets: ["Kayak & natation", "Tournois inter-équipes", "Grands jeux quotidiens"],
    image: "/images/home/activity-sport.jpeg",
    icon: Compass,
  },
  {
    axis: "AXE 03",
    title: "DÉTENTE & EXPRESSION",
    description: "Jeux d'eau, musique et activités créatives dans une ambiance conviviale.",
    bullets: ["Jeux aquatiques encadrés", "Musique & animation", "Spectacle de fin de séjour"],
    image: "/images/home/activity-creative.jpeg",
    icon: Music2,
  },
];

export default function HomePage() {
  const [heroIndex, setHeroIndex] = useState(0);
  const { logout } = useAuth();

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroImages.length);
    }, 4000);
    return () => window.clearInterval(interval);
  }, [heroImages.length]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-slate-50/60 text-slate-900 antialiased">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo CSS" className="h-8 w-8 rounded-md object-cover" />
            <div>
              <p className="text-sm font-semibold leading-none">Colonie de Vacances</p>
              <p className="text-xs text-slate-500">CSS - Édition 2026</p>
            </div>
          </div>
          <Link
            to="/admin-login"
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0A1F5C] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#081848] hover:shadow-md"
          >
            <LogIn className="h-4 w-4" />
            Se connecter
          </Link>
        </div>
      </header>

      <section className="relative w-full overflow-hidden bg-gray-900">
        <div className="relative h-[calc(100vh-4rem)] min-h-[500px] w-full overflow-hidden bg-gray-900">
          <AnimatePresence mode="wait">
            <motion.img
              key={heroIndex}
              src={heroImages[heroIndex]}
              alt={`Colonie CSS ${heroIndex + 1}`}
              width={1280}
              height={896}
              className="absolute inset-0 h-full w-full object-cover"
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
            />
          </AnimatePresence>

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          <div className="absolute bottom-12 left-8 z-10 w-[min(90%,820px)] text-white sm:bottom-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/90 sm:text-sm">
              {heroCaptions[heroIndex]}
            </p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-6xl">
              Colonie de Vacances <span className="text-[#ff8600]">2026</span>
            </h1>
          </div>

          <div className="absolute bottom-12 right-8 z-10 flex flex-wrap items-center justify-end gap-3 sm:bottom-16">
            <Link
              to="/admin-login"
              onClick={logout}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#ff8000] px-6 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#e67900] hover:shadow-md"
            >
              Se connecter
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#programme"
              className="inline-flex h-12 items-center rounded-xl border border-white/70 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              Découvrir
            </a>
          </div>

          <div className="absolute bottom-7 left-8 z-10 flex items-center gap-2">
            {heroImages.map((_, index) => (
              <button
                type="button"
                aria-label={`Aller à l'image ${index + 1}`}
                onClick={() => setHeroIndex(index)}
                key={`hero-indicator-${index}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === heroIndex ? "w-10 bg-[#ff8600]" : "w-4 bg-white/50"
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      <section id="programme" className="relative overflow-hidden bg-[hsl(35,60%,98%)] py-24">
        <div className="pointer-events-none absolute -left-16 -top-24 h-[480px] w-[480px] rounded-full bg-[hsl(35,92%,92%)] opacity-70 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-[460px] w-[460px] rounded-full bg-[hsl(221,80%,18%)]/[0.04] blur-3xl" />
        <span className="pointer-events-none absolute right-[22%] top-24 h-3 w-3 rounded-full bg-[hsl(30,100%,50%)]" />
        <span className="pointer-events-none absolute left-[26%] bottom-28 h-2.5 w-2.5 rounded-full bg-[hsl(221,80%,18%)]/70" />

        <div className="relative mx-auto max-w-7xl px-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-4xl text-center"
          >
            <div className="inline-flex items-center gap-3 text-[hsl(30,100%,40%)]">
              <span className="h-px w-8 bg-[hsl(30,100%,50%)]" />
              <span className="text-xs font-semibold uppercase tracking-[0.25em]">Programme</span>
              <span className="h-px w-8 bg-[hsl(30,100%,50%)]" />
            </div>
            <h2 className="mt-5 text-3xl font-extrabold uppercase leading-tight text-[hsl(221,80%,18%)] lg:text-5xl">
              Trois axes pour un séjour équilibré
            </h2>
            <p className="mx-auto mt-4 max-w-3xl text-lg text-slate-600">
              Chaque journée associe découverte, activité physique et créativité, dans un cadre sécurisé et pédagogique.
            </p>
          </motion.div>

          <div className="mt-14 grid gap-10 md:grid-cols-3 lg:gap-14">
            {programAxes.map((item, i) => (
              <motion.article
                key={item.axis}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="group flex flex-col items-center text-center"
              >
                <div className="relative h-56 w-56 lg:h-64 lg:w-64 transition-transform duration-500 group-hover:-translate-y-2">
                  <div className="absolute inset-0 overflow-hidden rounded-full shadow-[0_20px_40px_-20px_rgba(15,23,42,0.25)]">
                    <img
                      src={item.image}
                      alt={item.title}
                      width={800}
                      height={600}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/10 to-transparent" />
                  </div>

                  <svg className="pointer-events-none absolute -bottom-5 left-1/2 h-8 w-[200px] -translate-x-1/2" viewBox="0 0 200 40" fill="none" aria-hidden="true">
                    <path d="M10 8 Q100 38 190 8" stroke="hsl(30,100%,50%)" strokeWidth="3.5" strokeLinecap="round" />
                  </svg>

                  <div className="absolute -right-2 -top-2 rounded-full bg-white/90 p-1 shadow-md backdrop-blur">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(30,100%,50%)] text-white shadow-lg">
                      <item.icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>

                <p className="mt-8 text-[10px] font-bold tracking-[0.3em] text-[hsl(30,100%,40%)]">{item.axis}</p>
                <h3 className="mt-3 text-xl font-extrabold uppercase text-[hsl(221,80%,18%)] lg:text-2xl">{item.title}</h3>
                <p className="mt-3 text-sm text-slate-600">{item.description}</p>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  {item.bullets.map((point) => (
                    <div key={`${item.axis}-${point}`} className="mb-1.5 flex items-center justify-center gap-2 text-sm text-slate-700 last:mb-0">
                      <span className="h-1 w-1 rounded-full bg-[hsl(30,100%,50%)]" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>

                <a href="#programme" className="group/btn mt-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(221,80%,18%)]">
                  Découvrir
                  <ArrowRight className="h-3.5 w-3.5 text-[hsl(30,100%,50%)] transition-transform duration-300 group-hover/btn:translate-x-1" />
                </a>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="nos-engagements" className="relative overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] py-20">
        <div className="pointer-events-none absolute -left-16 top-16 h-48 w-48 rounded-full bg-[#ffecd1] blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-8 h-48 w-48 rounded-full bg-[#dbe7ff] blur-3xl" />
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
            <div className="relative">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="group relative overflow-hidden rounded-3xl border border-white/70 shadow-[0_30px_50px_-30px_rgba(15,23,42,0.75)]"
              >
                <img
                  src="/images/home/hero-2.jpeg"
                  alt="Nos engagements"
                  width={1280}
                  height={896}
                  className="h-[480px] w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/30 to-transparent" />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="absolute -bottom-6 -right-4 sm:right-6 max-w-[240px] rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_24px_36px_-24px_rgba(2,6,23,0.9)]"
              >
                <div className="mb-2 flex items-center gap-1 text-[#ff8600]">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={`engagement-star-${index}`} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="text-sm font-semibold leading-snug text-[#070b4f]">« Mon fils en parle encore tous les jours ! »</p>
                <p className="mt-1 text-xs text-slate-500">— Aissatou D., parent</p>
              </motion.div>
            </div>

            <div>
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700">
                Nos engagements
              </span>
              <h2 className="mt-3 text-3xl font-bold leading-tight text-[#070b4f] sm:text-5xl">
                Pourquoi nous faire <span className="text-[#ff8600]">confiance</span>
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Nous accompagnons les enfants dans un cadre sécurisé, éducatif et riche en souvenirs.
              </p>

              <div className="mt-6 space-y-4">
                {engagementValues.map((value, i) => (
                  <motion.article
                    key={value.title}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all duration-300 hover:translate-x-1 hover:shadow-[0_18px_28px_-22px_rgba(2,6,23,0.9)]"
                  >
                    <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#05085a]">
                      <value.icon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{value.title}</h3>
                      <p className="text-sm text-slate-600">{value.description}</p>
                    </div>
                  </motion.article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-[hsl(221,80%,18%)] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-3 lg:px-10">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-md bg-white p-1.5">
                <img src={logo} alt="Logo CSS" className="h-7 w-auto object-cover" />
              </div>
              <p className="font-semibold">Colonie 2026</p>
            </div>
            <p className="max-w-xs text-white/70">Portail officiel d'inscription pour les enfants des employés.</p>
          </div>

          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[hsl(35,92%,75%)]">Contact</p>
            <ul className="space-y-3 text-white/80">
              <li className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-[hsl(30,100%,60%)]" />
                33 889 19 89
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-[hsl(30,100%,60%)]" />
                caisse@secusociale.sn
              </li>
              <li className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-[hsl(30,100%,60%)]" />
                Dakar, Sénégal
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[hsl(35,92%,75%)]">Navigation</p>
            <ul className="space-y-2 text-white/80">
              <li><a href="#programme" className="transition-colors hover:text-white">Programme</a></li>
              <li><a href="#nos-engagements" className="transition-colors hover:text-white">Nos engagements</a></li>
              {/*
              <li><a href="#programme" className="transition-colors hover:text-white">Étapes</a></li>
              <li><a href="#programme" className="transition-colors hover:text-white">Informations</a></li>
              */}
              <li><Link to="/admin-login" onClick={logout} className="transition-colors hover:text-white">Connexion</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 text-xs text-white/50 lg:px-10">
            <span>© 2026 — Tous droits réservés.</span>
            <span>Édition 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
