/**
 * Converts `rem` units to fixed `px` (16px base) so Tailwind utilities rendered
 * inside Shadow DOM are 100% immune to host pages setting `html { font-size: 62.5% }`.
 */
const remToPxPlugin = () => ({
  postcssPlugin: 'cloakshot-rem-to-px',
  Declaration(decl) {
    if (decl.value && decl.value.includes('rem')) {
      decl.value = decl.value.replace(/(-?\d*\.?\d+)rem/g, (_, num) => {
        const px = parseFloat(num) * 16;
        return `${Number.isInteger(px) ? px : px.toFixed(2)}px`;
      });
    }
  },
});
remToPxPlugin.postcss = true;

module.exports = {
  plugins: [
    require('tailwindcss'),
    remToPxPlugin(),
    require('autoprefixer'),
  ],
};
