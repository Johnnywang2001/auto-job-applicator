const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Teal briefcase icon SVG
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <!-- Background -->
  <rect x="0" y="0" width="128" height="128" rx="24" fill="#FAFAF9"/>
  
  <!-- Briefcase body -->
  <rect x="18" y="44" width="92" height="64" rx="10" fill="#0D9488"/>
  
  <!-- Briefcase flap/detail -->
  <rect x="18" y="44" width="92" height="28" rx="10" fill="#0F766E"/>
  
  <!-- Handle -->
  <path d="M 44 44 L 44 32 Q 44 20 64 20 Q 84 20 84 32 L 84 44" 
        stroke="#0F766E" stroke-width="10" fill="none" stroke-linecap="round"/>
  
  <!-- Lock/clasp -->
  <rect x="58" y="52" width="12" height="16" rx="3" fill="#FAFAF9"/>
  <circle cx="64" cy="60" r="3" fill="#0D9488"/>
</svg>`;

const sizes = [16, 48, 128];
const outputDir = path.join(__dirname, '..', 'public', 'assets');

async function generateIcons() {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon${size}.png`);
    await sharp(Buffer.from(svgIcon))
      .resize(size, size, { fit: 'contain', background: { r: 250, g: 250, b: 249, alpha: 1 } })
      .png()
      .toFile(outputPath);
    console.log(`Generated: ${outputPath}`);
  }

  console.log('All icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
