import { documentUrl } from '../lib/cms/documents';

export type PortfolioDocument = {
  label: string;
  description: string;
  previewUrl: string;
  openUrl: string;
  downloadUrl: string;
};

const resumeUrl = documentUrl('resume');
const cvUrl = documentUrl('cv');

export const documents: Record<'resume' | 'cv', PortfolioDocument | null> = {
  resume: {
    label: 'Resume',
    description: 'Professional experience and applied engineering work.',
    previewUrl: resumeUrl,
    openUrl: resumeUrl,
    downloadUrl: documentUrl('resume', true),
  },
  cv: {
    label: 'Academic CV',
    description: 'Research, publications, and academic experience.',
    previewUrl: cvUrl,
    openUrl: cvUrl,
    downloadUrl: documentUrl('cv', true),
  },
};