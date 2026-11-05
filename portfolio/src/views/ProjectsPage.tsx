"use client";

import type { ProjectRecord } from "../lib/cms/model";
import { ContentNotice, ProjectList } from "../components/content/ContentLists";
import { useState } from "react";
import type { ProjectCategory } from "../types/content";

type ProjectFilter = ProjectCategory | 'All';
const categories: ProjectFilter[] = ["All", "Engineering", "Civic"];

export default function ProjectsPage({ projects, unavailable = false }: { projects: ProjectRecord[]; unavailable?: boolean }) {
  const [selectedCategory, setSelectedCategory] = useState<ProjectFilter>("Engineering");
  const filteredProjects = selectedCategory === 'All'
    ? projects
    : projects.filter(project => project.categories.includes(selectedCategory));

  return (
    <div className="projects-page page-shell">
      <header className="home-heading">
        <h1>Projects</h1>
        <p>The best way to actually &quot;learn&quot; is by doing. By going down the rabbit hole on a tough problem and learning by building. My undergraduate years have instilled in me the spirit of a builder. I have spent an ample amount of time tinkering with solutions, performing independent research, building from scratch, and contributing to remarkable initiatives. I gravitate towards areas most people tend to shy away from - understanding the nuts and bolts of a solution and the knowledge needed to build from scratch - because that is mostly where the innovation lies. That insight provides the power not only to innovate but also to optimize.</p>
      </header>

      <nav className="project-filters" aria-label="Filter projects">
        {categories.map(category => <button
          key={category}
          type="button"
          onClick={() => setSelectedCategory(category)}
          aria-pressed={selectedCategory === category}
          aria-controls="project-list"
        >{category}</button>)}
      </nav>
      <p className="sr-only" role="status">{filteredProjects.length} projects shown</p>

      <div id="project-list">{filteredProjects.length ? <ProjectList entries={filteredProjects} /> : <ContentNotice label="Projects" unavailable={unavailable} />}</div>

      <footer className="projects-footer">
        <p>More experiments and work in progress on <a href="https://github.com/silasosunba" target="_blank" rel="noopener noreferrer">GitHub ↗</a></p>
      </footer>
    </div>
  );
}
