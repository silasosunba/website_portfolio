import { getPublicContent } from "../lib/cms/repository";
import { ArticleList, ContentNotice } from "../components/content/ContentLists";

export default async function ArticlesPage() {
  const articles = await getPublicContent("articles");
  return (
    <div className="articles-page page-shell">
      <header className="home-heading">
        <h1>Writings</h1>
        <p>Here is where I write what I think.</p>
      </header>

      {articles.entries.length ? <ArticleList entries={articles.entries} /> : <div className="mt-8"><ContentNotice label="Writings" unavailable={articles.unavailable} /></div>}

      <footer className="projects-footer">
        <p>More notes and writing on <a href="https://medium.com/@tolanisilas3606" target="_blank" rel="noopener noreferrer">Medium ↗</a></p>
      </footer>
    </div>
  );
}
