"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import {
  FaEnvelope,
  FaGithub,
  FaLinkedin,
  FaRegCommentDots,
  FaTag,
  FaTelegramPlane,
  FaUser,
} from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import emailjs from "@emailjs/browser";
import { useTheme } from "../context/theme";

export default function ContactPage() {
  const { isDark } = useTheme();
  const formRef = useRef<HTMLFormElement>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [subject, setSubject] = useState("");
  const [customSubject, setCustomSubject] = useState("");

  useEffect(() => {
    void initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setEngineReady(true));
  }, []);

  const sendEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formRef.current) return;
    setLoading(true);

    emailjs
      .sendForm("osunba_silas", "osunba_silas_template", formRef.current, "ZO_6gkFmGFacWDao-")
      .then(
        () => {
          setStatus("Message sent successfully.");
          setLoading(false);
          formRef.current?.reset();
          setSubject("");
          setCustomSubject("");
        },
        () => {
          setStatus("Failed to send. Please try again.");
          setLoading(false);
        },
      );
  };

  const particleColor = isDark ? "#c4a574" : "#0f766e";

  return (
    <div className="contact-page relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-28">
      {engineReady && (
        <div className="absolute inset-0 -z-10">
          <Particles
            id="tsparticles"
            options={{
              background: { color: { value: "transparent" } },
              fpsLimit: 120,
              interactivity: {
                events: { onHover: { enable: true, mode: "repulse" } },
                modes: { repulse: { distance: 100, duration: 0.4 } },
              },
              particles: {
                color: { value: particleColor },
                links: {
                  color: particleColor,
                  distance: 150,
                  enable: true,
                  opacity: 0.35,
                },
                move: { enable: true, speed: 1, direction: "none", outModes: "out" },
                number: { value: 50, density: { enable: true, width: 800, height: 800 } },
                opacity: { value: 0.45 },
                shape: { type: "circle" },
                size: { value: { min: 1, max: 3 } },
              },
              detectRetina: true,
            }}
          />
        </div>
      )}

      <div className="relative z-10 w-full max-w-6xl">
        <div className="mb-16 text-center">

          <h1 className="page-title mb-4">Get in Touch</h1>
          <p className="mx-auto max-w-2xl page-lead text-muted dark:text-muted-dark">
            Let’s talk about research, ideas, and what we can build together.
          </p>
        </div>

        <div className="grid items-start gap-16 md:grid-cols-2">
          <div>
            <h3 className="section-title mb-4">Let&apos;s connect</h3>
            <p className="mb-5 leading-relaxed text-muted dark:text-muted-dark">
              I’m mostly interested in <strong className="font-semibold text-ink dark:text-ink-dark">startups, AI research, trustworthy AI, and Applied ML</strong>.
              I’d love to connect with people exploring how intelligent systems can be more reliable,
              understandable, and useful in people’s lives.
            </p>
            <p className="mb-8 leading-relaxed text-muted dark:text-muted-dark">
              Have a research question or a collaboration in mind? Send me a message, or connect directly below.
            </p>
            <nav aria-label="Connect with Silas" className="flex flex-wrap items-center gap-4">
              {[
                { icon: FaEnvelope, title: "Email Silas", href: "mailto:osunbasilas@gmail.com" },
                { icon: FaGithub, title: "GitHub", href: "https://github.com/silasosunba" },
                { icon: FaLinkedin, title: "LinkedIn", href: "https://www.linkedin.com/in/osunbasilas/" },
                { icon: FaXTwitter, title: "X", href: "https://x.com/thaguymaxx" },
              ].map(({ icon: Icon, title, href }) => (
                <a
                  key={title}
                  href={href}
                  aria-label={title}
                  title={title}
                  {...(href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-line text-xl transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent dark:border-line-dark dark:hover:border-gold dark:hover:bg-gold/10 dark:hover:text-gold dark:focus-visible:outline-gold"
                >
                  <Icon aria-hidden="true" focusable="false" />
                </a>
              ))}
            </nav>
          </div>

          <div className="card-surface w-full p-6 sm:p-8">
            <h3 className="section-title mb-6">Send a message</h3>
            <form ref={formRef} onSubmit={sendEmail} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="from_name" className="mb-2 block text-sm font-medium">Name *</label>
                  <div className="contact-field">
                    <FaUser className="text-muted dark:text-muted-dark" aria-hidden="true" />
                    <input
                      type="text"
                      id="from_name" name="from_name"
                      placeholder="Your full name"
                      className="w-full rounded-xl bg-transparent p-3 outline-none placeholder:text-muted"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="from_email" className="mb-2 block text-sm font-medium">Email *</label>
                  <div className="contact-field">
                    <FaEnvelope className="text-muted dark:text-muted-dark" aria-hidden="true" />
                    <input
                      type="email"
                      id="from_email" name="from_email"
                      placeholder="your.email@gmail.com"
                      className="w-full rounded-xl bg-transparent p-3 outline-none placeholder:text-muted"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="subject" className="mb-2 block text-sm font-medium">Subject *</label>
                <div className="contact-field">
                  <FaTag className="text-muted dark:text-muted-dark" aria-hidden="true" />
                  <select
                    id="subject" name="subject"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="w-full appearance-none rounded-xl bg-transparent p-3 outline-none"
                    required
                  >
                    <option value="">Select a subject</option>
                    <option value="Research Collaboration">Research Collaboration</option>
                    <option value="Project Inquiry">Project Inquiry</option>
                    <option value="Collaboration Opportunity">Collaboration Opportunity</option>
                    <option value="Speaking Engagement">Speaking Engagement</option>
                    <option value="General Question">General Question</option>
                    <option value="Feedback">Feedback</option>
                    <option value="Other">Other (Custom Subject)</option>
                  </select>
                </div>
              </div>

              {subject === "Other" && (
                <div>
                  <label htmlFor="custom_subject" className="mb-2 block text-sm font-medium">Custom Subject *</label>
                  <div className="contact-field">
                    <FaTag className="text-muted dark:text-muted-dark" aria-hidden="true" />
                    <input
                      type="text"
                      id="custom_subject" name="custom_subject"
                      placeholder="Enter your custom subject"
                      className="w-full rounded-xl bg-transparent p-3 outline-none placeholder:text-muted"
                      value={customSubject}
                      onChange={(event) => setCustomSubject(event.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="message" className="mb-2 block text-sm font-medium">Message *</label>
                <div className="contact-field contact-field-message">
                  <FaRegCommentDots className="text-muted dark:text-muted-dark" aria-hidden="true" />
                  <textarea
                    id="message" name="message"
                    rows={5}
                    placeholder="Tell me about your project, research, or question..."
                    className="w-full rounded-xl bg-transparent p-3 outline-none placeholder:text-muted"
                    required
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? (
                  "Sending..."
                ) : (
                  <>
                    Send Message
                    <FaTelegramPlane />
                  </>
                )}
              </button>
            </form>
            {status && <p role="status" className="mt-4 text-sm text-muted dark:text-muted-dark">{status}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
