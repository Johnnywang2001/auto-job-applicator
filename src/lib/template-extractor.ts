export interface ExtractedTemplateStyle {
  fontFamily?: string;
  headingColor?: string;
  accentColor?: string;
  bodyColor?: string;
  sectionOrder?: ('summary' | 'skills' | 'experience' | 'education')[];
}

/**
 * Extract style hints from mammoth-generated HTML.
 * This is a best-effort extraction — mammoth outputs inline styles
 * that reflect the original Word document's formatting.
 */
export function extractTemplateStyle(html: string): ExtractedTemplateStyle {
  const defaults: ExtractedTemplateStyle = {
    fontFamily: 'Calibri, sans-serif',
    headingColor: '0D9488',
    accentColor: '0D9488',
    bodyColor: '1C1917',
    sectionOrder: ['summary', 'skills', 'experience', 'education']
  };

  // Extract font-family from the most common inline style
  const fontMatch = html.match(/font-family:\s*([^;"]+)/i);
  if (fontMatch) {
    const raw = fontMatch[1].trim();
    // Clean up common Word font names for docx library compatibility
    const clean = raw
      .replace(/Calibri\s*Light/i, 'Calibri')
      .replace(/Times\s*New\s*Roman/i, 'Times New Roman')
      .replace(/Arial\s*MT/i, 'Arial');
    defaults.fontFamily = clean;
  }

  // Extract colors from inline styles
  const colorMatches = html.match(/color:\s*#?([0-9A-Fa-f]{6})/gi);
  if (colorMatches && colorMatches.length > 0) {
    // First color is usually body text, later ones are headings
    const colors = colorMatches.map(c => {
      const hex = c.match(/#?([0-9A-Fa-f]{6})/i);
      return hex ? hex[1].toUpperCase() : '1C1917';
    });

    // Deduplicate and pick meaningful colors
    const unique = [...new Set(colors)];
    if (unique.length >= 1) defaults.bodyColor = unique[0];
    if (unique.length >= 2) defaults.headingColor = unique[1];
    if (unique.length >= 3) defaults.accentColor = unique[2];
  }

  // Detect section order from HTML structure
  const order: ('summary' | 'skills' | 'experience' | 'education')[] = [];
  const lowerHtml = html.toLowerCase();

  // Find positions of section keywords in the HTML
  const positions: { section: 'summary' | 'skills' | 'experience' | 'education'; pos: number }[] = [];

  const sectionKeywords: Record<string, ('summary' | 'skills' | 'experience' | 'education')> = {
    'summary': 'summary',
    'objective': 'summary',
    'profile': 'summary',
    'skills': 'skills',
    'technical skills': 'skills',
    'core competencies': 'skills',
    'experience': 'experience',
    'work experience': 'experience',
    'professional experience': 'experience',
    'employment': 'experience',
    'education': 'education',
    'academic': 'education',
    'qualifications': 'education'
  };

  for (const [keyword, section] of Object.entries(sectionKeywords)) {
    const pos = lowerHtml.indexOf(keyword);
    if (pos !== -1) {
      positions.push({ section, pos });
    }
  }

  // Sort by position in document and deduplicate
  positions.sort((a, b) => a.pos - b.pos);
  const seen = new Set<string>();
  for (const p of positions) {
    if (!seen.has(p.section)) {
      seen.add(p.section);
      order.push(p.section);
    }
  }

  // Fill in any missing sections at the end
  const allSections: ('summary' | 'skills' | 'experience' | 'education')[] = ['summary', 'skills', 'experience', 'education'];
  for (const s of allSections) {
    if (!seen.has(s)) order.push(s);
  }

  defaults.sectionOrder = order;

  return defaults;
}
