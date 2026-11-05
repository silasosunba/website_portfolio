"use client";

import { useState } from "react";
import { education, experienceGroups, service, type AboutEntry } from "../data/about";
import { publications } from "../data/publications";

function AffiliationLogo({ entry }: { entry: AboutEntry }) {
  const [failed, setFailed] = useState(false);
  return <span className="affiliation-logo" aria-hidden="true">
    {entry.logo && !failed ? <img src={entry.logo} alt="" width={40} height={40} loading="lazy" onError={() => setFailed(true)} /> : <span>{entry.initials ?? entry.organization?.split(' ').map(word => word[0]).slice(0, 3).join('')}</span>}
  </span>;
}

function EntryList({ title, entries, subsection = false }: { title: string; entries: AboutEntry[]; subsection?: boolean }) {
  const Heading = subsection ? 'h3' : 'h2';
  const RoleHeading = subsection ? 'h4' : 'h3';
  return (
    <section className={`about-records${subsection ? " about-experience-group" : ""}`}>
      <Heading>{title}</Heading>
      <ul>{entries.map(entry => (
        <li key={`${entry.title}-${entry.organization}`}>
          <span className="about-period">{entry.period}</span>
          <div className="about-affiliation"><AffiliationLogo entry={entry} /><div><RoleHeading>{entry.title}{entry.organization && <span>, {entry.organization}</span>}</RoleHeading><p>{entry.detail}</p></div></div>
        </li>
      ))}</ul>
    </section>
  );
}

function Papers() {
  return <section className="about-records"><h2>Papers</h2><ul>
    {publications.map(publication => <li key={publication.link}>
      <span className="about-period">{publication.year}</span>
      <div className="about-paper-line"><a href={publication.link} target="_blank" rel="noopener noreferrer">{publication.title}</a>, {publication.venue}</div>
    </li>)}
  </ul></section>;
}

export default function AboutPage() {
  return (
    <article className="about-page page-shell">
      <header className="home-heading">
        <h1>About</h1>
        <p>AI research, responsible intelligence, and the people it serves.</p>
      </header>
      <div id="about-story">
        <div className="about-story">
          <p>I am Silas Osunba, an AI Research Engineer.</p>
          <p>
            I am on a mission on building and scaling machine learning systems,
            that are locally grounded and globally relevant. To this end, my work
            brings together foundations and techniques in Applied ML, software
            engineering, and grounded research. The central questions my work
            promotes are: How can intelligent systems be deployed ethically and
            responsibly? How can we align the output of these contemporary AI
            systems with human intentions, values, and ethical standards? And
            finally, how can we develop and deploy AI systems that build user and
            societal trust?
          </p>
          <p>
            My undergraduate degree in Electronic and Computer Engineering (Major
            in Machine Intelligence &amp; Minor in Economics) has prepared me to
            pursue this mission. During the last five years, I have spent most of
            my time learning about the underlying technology powering Machine
            Intelligence. I have tinkered with the foundational mathematics -
            statistics, probability, gradient descent and lots more - and developed
            an understanding of the steps in neural networks and the internal
            computations of LLMs.
          </p>
          <p>
            I have made contributions to problems of global and national interest,
            such as building an automated detection model for diabetic retinopathy
            and an oil spill detection model. My work on developing high-performing
            and reliable AI systems has had an impact across the globe. I have
            built AI systems that are aligned and grounded in accurate, up-to-date,
            and pertinent data; I have also developed systems that are AI-assisted
            but require a human in the loop.
          </p>
          <p>
            Education and community are so important to me. Education has provided
            me with so much access, and community has helped me develop a sense of
            belonging. With my solid education, coupled with my love for community,
            I have been able to revive, build, and sustain organizations. I
            co-founded Inspire The Students Initiative, an initiative supported
            and promoted by the United Nations Academic Impact (UNAI). It was
            developed because my fellow students and I faced limited access to
            open education and information. I have watched this initiative deliver value to over 5,000
            students, including students from at least 10 universities in Nigeria.
          </p>
          <p>
            I also served as the Vice President and President of the Society of
            Petroleum Engineers International (SPEI), Lagos State University
            Student Chapter, where I led the organization to unprecedented
            heights. Teaching and sharing knowledge are also things I enjoy
            doing. I have volunteered to assist my fellow and junior students by
            sharing knowledge in Engineering Mathematics, Machine Intelligence,
            and electrical engineering courses.
          </p>
          <p>
            I like to have fun. Living is ensuring we relish all our time here on
            earth - either doing what we love (doing hard and interesting work) or
            having fun with family and friends. Outside of work, I follow football and am also
            a die-hard supporter of Barcelona (one of my wildest dreams is to support my club live at Camp Nou, someday). I also explore finance and blockchain, and I enjoy
            playing snooker. Most importantly, I am a melomaniac,
            probably because I wanted to be a rapper/trap star until I locked out
            to lock in on my engineering studies. Fun fact: I released a song on
            Audiomack way back in 2020 (“<a href="https://audiomack.com/soundsfromib/song/only-you" target="_blank" rel="noopener noreferrer">Only You</a> ”) at 16.
          </p>
        </div>
        <section className="about-experience"><h2>Experience</h2>{experienceGroups.map(group => <EntryList key={group.title} title={group.title} entries={group.entries} subsection />)}</section>
        <EntryList title="Education" entries={education} />
        <Papers />
        <EntryList title="Teaching, Service, Leadership, & Impact" entries={service} />
      </div>

    </article>
  );
}