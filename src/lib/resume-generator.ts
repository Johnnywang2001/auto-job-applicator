import type { ExtractedTemplateStyle } from './template-extractor';

export interface OptimizedResume {
  name: string;
  contact: string;
  summary: string;
  skills: string[];
  experience: {
    company: string;
    title: string;
    dates: string;
    bullets: string[];
  }[];
  education: {
    institution: string;
    degree: string;
    dates: string;
  }[];
}

function toDocxFontFamily(cssFont: string): string {
  const first = cssFont.split(',')[0].trim().replace(/['"]/g, '');
  return first || 'Calibri';
}

export async function generateResumeDocx(
  optimized: OptimizedResume,
  style?: ExtractedTemplateStyle
): Promise<Blob> {
  const { Document, Paragraph, TextRun, AlignmentType, Packer } = await import('docx');

  const s: ExtractedTemplateStyle = {
    fontFamily: 'Calibri, sans-serif',
    headingColor: '0D9488',
    accentColor: '0D9488',
    bodyColor: '1C1917',
    sectionOrder: ['summary', 'skills', 'experience', 'education'],
    ...style
  };

  const totalWords = [
    optimized.summary,
    ...optimized.skills,
    ...optimized.experience.flatMap(e => [e.company, e.title, e.dates, ...e.bullets]),
    ...optimized.education.flatMap(e => [e.institution, e.degree, e.dates])
  ].join(' ').split(/\s+/).length;

  let margin = 0.75;
  let fontSize = 22;

  if (totalWords < 400) {
    margin = 0.5;
    fontSize = 21;
  } else if (totalWords > 550) {
    margin = 0.75;
    fontSize = 22;
  }

  const marginTwips = margin * 1440;
  const font = toDocxFontFamily(s.fontFamily);
  const headingColor = s.headingColor;
  const bodyColor = s.bodyColor;
  const mutedColor = '78716C';

  const headingRun = (text: string) =>
    new TextRun({ text, bold: true, size: fontSize, color: headingColor, font });

  const bodyRun = (text: string) =>
    new TextRun({ text, size: fontSize, color: bodyColor, font });

  const mutedRun = (text: string) =>
    new TextRun({ text, size: 20, italics: true, color: mutedColor, font });

  const children: any[] = [];

  children.push(new Paragraph({
    children: [new TextRun({
      text: optimized.name,
      bold: true,
      size: 32,
      color: s.headingColor,
      font
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }));

  children.push(new Paragraph({
    children: [new TextRun({
      text: optimized.contact,
      size: 20,
      color: '78716C',
      font
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
  }));

  for (const section of s.sectionOrder) {
    switch (section) {
      case 'summary':
        if (optimized.summary) {
          children.push(new Paragraph({
            children: [headingRun('Summary')],
            spacing: { before: 200, after: 120 },
          }));
          children.push(new Paragraph({
            children: [bodyRun(optimized.summary)],
            spacing: { after: 200 },
          }));
        }
        break;
      case 'skills':
        if (optimized.skills.length > 0) {
          children.push(new Paragraph({
            children: [headingRun('Skills')],
            spacing: { before: 200, after: 120 },
          }));
          children.push(new Paragraph({
            children: [bodyRun(optimized.skills.join(' · '))],
            spacing: { after: 200 },
          }));
        }
        break;
      case 'experience':
        if (optimized.experience.length > 0) {
          children.push(new Paragraph({
            children: [headingRun('Experience')],
            spacing: { before: 200, after: 120 },
          }));
          for (const exp of optimized.experience) {
            children.push(new Paragraph({
              children: [
                new TextRun({ text: exp.title, bold: true, size: fontSize, color: bodyColor, font }),
                new TextRun({ text: `  |  ${exp.company}`, size: fontSize, color: mutedColor, font }),
              ],
              spacing: { after: 60 },
            }));
            children.push(new Paragraph({
              children: [mutedRun(exp.dates)],
              spacing: { after: 100 },
            }));
            for (const bullet of exp.bullets) {
              children.push(new Paragraph({
                children: [bodyRun(bullet)],
                bullet: { level: 0 },
                spacing: { after: 80 },
              }));
            }
            children.push(new Paragraph({ spacing: { after: 160 } }));
          }
        }
        break;
      case 'education':
        if (optimized.education.length > 0) {
          children.push(new Paragraph({
            children: [headingRun('Education')],
            spacing: { before: 200, after: 120 },
          }));
          for (const edu of optimized.education) {
            children.push(new Paragraph({
              children: [
                new TextRun({ text: edu.degree, bold: true, size: fontSize, color: bodyColor, font }),
                new TextRun({ text: `  |  ${edu.institution}`, size: fontSize, color: mutedColor, font }),
              ],
              spacing: { after: 60 },
            }));
            children.push(new Paragraph({
              children: [mutedRun(edu.dates)],
              spacing: { after: 120 },
            }));
          }
        }
        break;
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: marginTwips,
            right: marginTwips,
            bottom: marginTwips,
            left: marginTwips,
          },
        },
      },
      children,
    }],
  });

  return await Packer.toBlob(doc);
}

export async function generateCoverLetterDocx(
  letterText: string,
  company: string,
  title: string,
  style?: ExtractedTemplateStyle
): Promise<Blob> {
  const { Document, Paragraph, TextRun, AlignmentType, Packer } = await import('docx');

  const s: ExtractedTemplateStyle = {
    fontFamily: 'Calibri, sans-serif',
    headingColor: '0D9488',
    accentColor: '0D9488',
    bodyColor: '1C1917',
    sectionOrder: ['summary', 'skills', 'experience', 'education'],
    ...style
  };

  const font = toDocxFontFamily(s.fontFamily || 'Calibri, sans-serif');
  const paragraphs = letterText.split('\n').filter(p => p.trim());

  const children: any[] = [
    new Paragraph({
      children: [new TextRun({
        text: `${company} — ${title}`,
        bold: true,
        size: 28,
        color: s.headingColor,
        font
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
  ];

  for (const text of paragraphs) {
    children.push(new Paragraph({
      children: [new TextRun({
        text: text.trim(),
        size: 22,
        color: s.bodyColor,
        font
      })],
      spacing: { after: 200, line: 276 },
    }));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1440,
          },
        },
      },
      children,
    }],
  });

  return await Packer.toBlob(doc);
}
