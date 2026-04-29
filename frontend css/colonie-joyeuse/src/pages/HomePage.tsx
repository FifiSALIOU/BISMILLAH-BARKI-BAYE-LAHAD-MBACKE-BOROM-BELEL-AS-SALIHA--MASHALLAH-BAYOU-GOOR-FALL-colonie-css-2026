import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LogIn, ShieldCheck, Users, Sparkles, Leaf, Flame, Compass, Music2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import logo from "@/assets/logo.png";

const heroImages = [
  "/images/home/hero-1.jpeg",
  "/images/home/hero-2.jpeg",
  "/images/home/hero-3.jpeg",
  "/images/home/hero-4.jpeg",
  "/images/home/hero-5.jpeg",
];

const heroCaptions = [
  "Photo officielle - Colonie CSS",
  "Photo officielle - Colonie CSS",
  "Grande ronde dans le parc",
  "Echauffement avant les activites sportives",
  "Joie et eclats d'eau a la piscine",
];

const activities = [
  {
    title: "Pleine nature",
    description: "Randonnées et découverte de la faune et de la flore.",
    image: "/images/home/activity-nature.jpeg",
    icon: Leaf,
  },
  {
    title: "Feux de camp",
    description: "Soirées chants et contes sous les étoiles.",
    image: "/images/home/activity-camp.jpeg",
    icon: Flame,
  },
  {
    title: "Sports & aventure",
    description: "Canoe, escalade et activités encadrées.",
    image: "/images/home/activity-sport.jpeg",
    icon: Compass,
  },
  {
    title: "Ateliers créatifs",
    description: "Musique, arts et théâtre pour éveiller l'imagination.",
    image: "/images/home/activity-creative.jpeg",
    icon: Music2,
  },
];

export default function HomePage() {
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroImages.length);
    }, 4000);
    return () => window.clearInterval(interval);
  }, [heroImages.length]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo CSS" className="h-8 w-8 rounded-md object-cover" />
            <div>
              <p className="text-sm font-semibold leading-none">Colonie de Vacances</p>
              <p className="text-xs text-slate-500">CSS - Edition 2026</p>
            </div>
          </div>
          <Link
            to="/admin-login"
            className="inline-flex items-center gap-2 rounded-lg bg-[#ff8600] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#e67900]"
          >
            <LogIn className="h-4 w-4" />
            Connexion
          </Link>
        </div>
      </header>

      <section className="relative w-full h-[calc(100vh-4rem)] min-h-[500px] overflow-hidden bg-gray-900">
        <AnimatePresence mode="wait">
          <motion.img
            key={heroIndex}
            src={heroImages[heroIndex]}
            alt={`Colonie CSS ${heroIndex + 1}`}
            width={1280}
            height={896}
            className="absolute inset-0 w-full h-full object-cover"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-200">
                {heroCaptions[heroIndex]}
              </p>
              <h1 className="mt-2 text-4xl font-extrabold text-white md:text-5xl">
                Colonie de Vacances <span className="text-orange-400">2026</span>
              </h1>
              <div className="mt-5 flex items-center gap-2">
                {heroImages.map((_, index) => (
                  <span
                    key={`hero-indicator-${index}`}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      index === heroIndex ? "w-14 bg-orange-500" : "w-6 bg-white/55"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Link
                to="/admin-login"
                className="inline-flex items-center gap-2 rounded-xl bg-[#ff8600] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#e67900]"
              >
                Se connecter
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#programme"
                className="inline-flex items-center rounded-xl border border-white/60 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Decouvrir
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="programme" className="mx-auto max-w-7xl px-4 py-16">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-500">Programme</p>
          <h2 className="mt-3 text-4xl font-bold text-slate-900">Des activites pour tous les gouts</h2>
          <p className="mt-3 text-slate-500">Un programme riche pour eveiller la curiosite et creer des souvenirs.</p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {activities.map((item, i) => (
            <motion.article
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="group overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all hover:shadow-lg"
            >
              <div className="relative w-full h-48 overflow-hidden bg-gray-100">
                <img
                  src={item.image}
                  alt={item.title}
                  width={800}
                  height={600}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute left-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-orange-500 shadow-sm">
                  <item.icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.description}</p>
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-500">Nos engagements</p>
            <h2 className="mt-3 text-4xl font-bold text-slate-900">Pourquoi nous faire confiance</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <article className="rounded-2xl border bg-white p-8 text-center">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#05085a]">
                <ShieldCheck className="h-7 w-7 text-white" />
              </div>
              <h3 className="mt-4 text-2xl font-semibold">Securite absolue</h3>
              <p className="mt-2 text-slate-600">Encadrement professionnel certifie.</p>
            </article>
            <article className="rounded-2xl border bg-white p-8 text-center">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#05085a]">
                <Users className="h-7 w-7 text-white" />
              </div>
              <h3 className="mt-4 text-2xl font-semibold">Esprit d'equipe</h3>
              <p className="mt-2 text-slate-600">Le partage au coeur de chaque journee.</p>
            </article>
            <article className="rounded-2xl border bg-white p-8 text-center">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#05085a]">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <h3 className="mt-4 text-2xl font-semibold">Souvenirs durables</h3>
              <p className="mt-2 text-slate-600">Des amities qui durent toute une vie.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-[#ff8600] py-16">
        <div className="mx-auto max-w-3xl px-4 text-center text-white">
          <h2 className="text-4xl font-extrabold">Pret a offrir un ete magique ?</h2>
          <p className="mt-3 text-lg text-orange-100">Connectez-vous avec votre matricule pour inscrire vos enfants.</p>
          <Link
            to="/admin-login"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3 font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
          >
            <ArrowRight className="h-4 w-4" />
            Se connecter maintenant
          </Link>
        </div>
      </section>

      <footer className="bg-slate-950 py-5 text-sm text-slate-200">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Logo CSS" className="h-6 w-6 rounded object-cover" />
            <span>© 2026 Caisse de Securite Sociale</span>
          </div>
          <p>Colonie de Vacances - Tous droits reserves</p>
        </div>
      </footer>
    </div>
  );
}
