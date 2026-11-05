"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaGithub, FaLinkedin, FaMoon, FaSun, FaBars, FaTimes, FaEnvelope } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import DocumentViewer from "./DocumentViewer";
import { useTheme } from "../context/theme";

const Header = () => {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    if (!menuOpen) return;
    const toggleButton = menuToggle.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const background = [...document.querySelectorAll<HTMLElement>('main, .simple-footer')];
    const previousInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    menuPanel.current?.querySelector<HTMLAnchorElement>('a[href]')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        setMenuOpen(false);
        toggleButton?.focus();
      }
      if (event.key === 'Tab') {
        const controls = [...(menuPanel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])].filter(element => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const desktop = window.matchMedia("(min-width: 1280px)");
    const resize = () => { if (desktop.matches) setMenuOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    desktop.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      toggleButton?.focus();
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      desktop.removeEventListener("change", resize);
    };
  }, [menuOpen]);

  const navLinkClasses = (href: string) =>
    `site-nav-link block rounded-full px-2 py-2 text-sm transition ${
      pathname === href
        ? "text-accent font-semibold dark:text-gold"
        : "text-muted hover:text-ink dark:text-muted-dark dark:hover:text-ink-dark"
    }`;

  return (
    <header ref={header} className="site-header fixed top-0 left-0 z-50 w-full">
      <nav aria-label="Main navigation" className="border-b border-line/70 bg-canvas px-4 transition-colors duration-300 sm:px-6 md:px-10 xl:px-6 dark:border-line-dark/70 dark:bg-canvas-dark">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between py-3">
          <Link href="/" onClick={() => setMenuOpen(false)} className="font-display whitespace-nowrap text-[26px] font-semibold leading-none tracking-tight transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:text-3xl dark:hover:text-gold dark:focus-visible:outline-gold" aria-label="Silas Osunba home">
            Silas Osunba
          </Link>

          <div className="header-actions flex items-center gap-3 text-sm xl:order-2 sm:gap-4">
            <a
              href="https://github.com/silasosunba"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="text-muted transition hover:text-accent dark:text-muted-dark dark:hover:text-gold"
            >
              <FaGithub className="text-lg sm:text-xl" />
            </a>
            <a
              href="https://www.linkedin.com/in/osunbasilas/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="text-muted transition hover:text-accent dark:text-muted-dark dark:hover:text-gold"
            >
              <FaLinkedin className="text-lg sm:text-xl" />
            </a>
            <a
              href="https://x.com/thaguymaxx"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X"
              className="text-muted transition hover:text-accent dark:text-muted-dark dark:hover:text-gold"
            >
              <FaXTwitter className="text-lg sm:text-xl" />
            </a>

            <button
              onClick={toggleTheme}
              className="theme-toggle rounded-full border border-line p-2 text-ink transition hover:border-gold dark:border-line-dark dark:text-ink-dark"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <FaSun className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              ) : (
                <FaMoon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              )}
            </button>

            <button ref={menuToggle} type="button" className="mobile-menu-toggle xl:hidden" aria-label="Open navigation" aria-controls="mobile-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><FaBars aria-hidden="true" /></button>
          </div>

          <div
            ref={menuPanel}
            id="mobile-menu"
            role={menuOpen ? 'dialog' : undefined}
            aria-modal={menuOpen ? true : undefined}
            aria-label={menuOpen ? 'Navigation' : undefined}
            className={`site-nav-panel ${
              menuOpen ? "flex" : "hidden"
            } mt-3 w-full flex-col items-center xl:order-1 xl:mt-0 xl:flex xl:w-auto xl:flex-row xl:space-x-2 2xl:space-x-4`}
          >

            <DocumentViewer onNavigate={() => setMenuOpen(false)} />
            {[
              { href: "/", label: "Home" },
              { href: "/about", label: "About" },
              { href: "/projects", label: "Projects" },
              { href: "/articles", label: "Writings" },
              { href: "/books", label: "Books" },
            ].map(({ href, label }) => (
              <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={navLinkClasses(href)} onClick={() => setMenuOpen(false)}>
                {label}
              </Link>
            ))}
            <Link
              href="/contact"
              onClick={() => setMenuOpen(false)}
              className="mobile-contact btn-primary mt-2 px-5 py-2 xl:mt-0"
            >
              Contact
            </Link>
            <div className="mobile-menu-socials">
              <a href="https://www.linkedin.com/in/osunbasilas/" aria-label="LinkedIn" target="_blank" rel="noopener noreferrer"><FaLinkedin aria-hidden="true" /></a>
              <a href="https://github.com/silasosunba" aria-label="GitHub" target="_blank" rel="noopener noreferrer"><FaGithub aria-hidden="true" /></a>
              <a href="mailto:osunbasilas@gmail.com" aria-label="Email Silas"><FaEnvelope aria-hidden="true" /></a>
              <button type="button" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>{isDark ? <FaSun aria-hidden="true" /> : <FaMoon aria-hidden="true" />}</button>
            </div>
            <button type="button" className="mobile-menu-close" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><FaTimes aria-hidden="true" /></button>
          </div>
        </div>
      </nav>

    </header>
  );
};

export default Header;
