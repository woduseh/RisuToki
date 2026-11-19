import katexStyleSource from 'katex/dist/katex.min.css?raw';
import amsRegular from 'katex/dist/fonts/KaTeX_AMS-Regular.woff2?inline';
import caligraphicBold from 'katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?inline';
import caligraphicRegular from 'katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?inline';
import frakturBold from 'katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?inline';
import frakturRegular from 'katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?inline';
import mainBold from 'katex/dist/fonts/KaTeX_Main-Bold.woff2?inline';
import mainBoldItalic from 'katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?inline';
import mainItalic from 'katex/dist/fonts/KaTeX_Main-Italic.woff2?inline';
import mainRegular from 'katex/dist/fonts/KaTeX_Main-Regular.woff2?inline';
import mathBoldItalic from 'katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?inline';
import mathItalic from 'katex/dist/fonts/KaTeX_Math-Italic.woff2?inline';
import sansSerifBold from 'katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?inline';
import sansSerifItalic from 'katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?inline';
import sansSerifRegular from 'katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?inline';
import scriptRegular from 'katex/dist/fonts/KaTeX_Script-Regular.woff2?inline';
import size1Regular from 'katex/dist/fonts/KaTeX_Size1-Regular.woff2?inline';
import size2Regular from 'katex/dist/fonts/KaTeX_Size2-Regular.woff2?inline';
import size3Regular from 'katex/dist/fonts/KaTeX_Size3-Regular.woff2?inline';
import size4Regular from 'katex/dist/fonts/KaTeX_Size4-Regular.woff2?inline';
import typewriterRegular from 'katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?inline';

const woff2DataUris: Record<string, string> = {
  'KaTeX_AMS-Regular': amsRegular,
  'KaTeX_Caligraphic-Bold': caligraphicBold,
  'KaTeX_Caligraphic-Regular': caligraphicRegular,
  'KaTeX_Fraktur-Bold': frakturBold,
  'KaTeX_Fraktur-Regular': frakturRegular,
  'KaTeX_Main-Bold': mainBold,
  'KaTeX_Main-BoldItalic': mainBoldItalic,
  'KaTeX_Main-Italic': mainItalic,
  'KaTeX_Main-Regular': mainRegular,
  'KaTeX_Math-BoldItalic': mathBoldItalic,
  'KaTeX_Math-Italic': mathItalic,
  'KaTeX_SansSerif-Bold': sansSerifBold,
  'KaTeX_SansSerif-Italic': sansSerifItalic,
  'KaTeX_SansSerif-Regular': sansSerifRegular,
  'KaTeX_Script-Regular': scriptRegular,
  'KaTeX_Size1-Regular': size1Regular,
  'KaTeX_Size2-Regular': size2Regular,
  'KaTeX_Size3-Regular': size3Regular,
  'KaTeX_Size4-Regular': size4Regular,
  'KaTeX_Typewriter-Regular': typewriterRegular,
};

// The preview iframe is sandboxed without same-origin, so it cannot read the
// app's file:// font assets; KaTeX fonts must travel inside the stylesheet.
export const katexStyles = katexStyleSource.replace(
  /src:url\(fonts\/([\w-]+)\.woff2\)[^;}]*/g,
  (source: string, fontName: string) => {
    const dataUri = woff2DataUris[fontName];
    return dataUri ? `src:url(${dataUri}) format("woff2")` : source;
  },
);
