import Link from "next/link";
import portrait from "../assets/images/silas1.webp";
import { getPublicContent } from "../lib/cms/repository";
import { ContentNotice, NewsList } from "../components/content/ContentLists";

export default async function HomePage() {
  const news = await getPublicContent("news");
  return (
    <article className="home-introduction page-shell">
      <header className="home-heading">
        <h1>Silas Osunba</h1>
        <p>Building at the ethical and responsible layer of super intelligence.</p>
      </header>

      <div className="home-biography">
        <figure className="home-profile">
          <img
          src={portrait.src}
          alt="Silas Osunba"
          width={portrait.width}
          height={portrait.height}
          fetchPriority="high"
          className="home-photo"
          />
        </figure>
        <div className="home-prose">
          <p>
            I have been building and scaling at the convergence of applied machine
            learning, software engineering, and research. My research interests are
            in Applied Machine Learning, trustworthy AI and responsible AI.
          </p>
          <p>
            These are the questions I’m intrigued by and want to help answer:{' '}
            <em>How do we measure or quantify the trustworthiness of an AI system?
            How can users or operators understand how these systems reason? Why
            did the model make this specific decision? Is it viable for the
            system’s output to be traced and justified in human terms?</em>
          </p>
          <p>
            These questions require attention in high-stakes systems - healthcare,
            autonomous vehicles, and finance - where understanding how
            and why intelligent systems make decisions is essential to avoiding
            blind reliance on them.
          </p>
          <p>
            Recently, I graduated with First Class Honors in Electronic &amp;
            Computer Engineering. I care about AI for Social Good, education,
            and understand the importance of building a community.
          </p>
          <p>
            In my free time, I follow football, explore blockchain, play snooker,
            and enjoy reading. I keep track of what I read <Link href="/books">here</Link>.{' '}
            <Link href="/about">More about me</Link>.
          </p>
        </div>
      </div>
      <section className="home-news" aria-labelledby="news-heading">
        <h2 id="news-heading">News</h2>
        {news.entries.length ? <NewsList entries={news.entries} /> : <ContentNotice label="News" unavailable={news.unavailable} />}
      </section>
    </article>
  );
}
