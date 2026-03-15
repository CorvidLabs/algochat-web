import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  describe('plain text', () => {
    it('passes through plain text', () => {
      expect(renderMarkdown('hello world')).toBe('hello world');
    });

    it('escapes HTML entities', () => {
      expect(renderMarkdown('<script>alert("xss")</script>')).toContain('&lt;script&gt;');
      expect(renderMarkdown('<script>alert("xss")</script>')).not.toContain('<script>');
    });

    it('renders empty lines as breaks', () => {
      expect(renderMarkdown('a\n\nb')).toContain('<br>');
    });
  });

  describe('inline formatting', () => {
    it('renders bold with **', () => {
      expect(renderMarkdown('**bold**')).toBe('<strong>bold</strong>');
    });

    it('renders bold with __', () => {
      expect(renderMarkdown('__bold__')).toBe('<strong>bold</strong>');
    });

    it('renders italic with *', () => {
      expect(renderMarkdown('*italic*')).toBe('<em>italic</em>');
    });

    it('renders italic with _', () => {
      expect(renderMarkdown('_italic_')).toBe('<em>italic</em>');
    });

    it('renders bold+italic with ***', () => {
      expect(renderMarkdown('***both***')).toBe('<strong><em>both</em></strong>');
    });

    it('renders strikethrough with ~~', () => {
      expect(renderMarkdown('~~deleted~~')).toBe('<del>deleted</del>');
    });

    it('renders inline code', () => {
      expect(renderMarkdown('use `fmt.Println`')).toContain('<code>fmt.Println</code>');
    });

    it('does not apply formatting inside inline code', () => {
      const result = renderMarkdown('`**not bold**`');
      expect(result).toContain('<code>**not bold**</code>');
      expect(result).not.toContain('<strong>');
    });
  });

  describe('links and images', () => {
    it('renders links', () => {
      const result = renderMarkdown('[click](https://example.com)');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('>click</a>');
      expect(result).toContain('rel="noopener"');
    });

    it('renders images as linked alt text', () => {
      const result = renderMarkdown('![photo](https://img.example.com/a.png)');
      expect(result).toContain('href="https://img.example.com/a.png"');
      expect(result).toContain('🖼 photo');
    });
  });

  describe('headings', () => {
    it('renders h1-h6', () => {
      expect(renderMarkdown('# Title')).toContain('class="md-h md-h1"');
      expect(renderMarkdown('## Sub')).toContain('class="md-h md-h2"');
      expect(renderMarkdown('###### Deep')).toContain('md-h6');
    });

    it('applies inline formatting in headings', () => {
      expect(renderMarkdown('## **bold** heading')).toContain('<strong>bold</strong>');
    });
  });

  describe('code blocks', () => {
    it('renders fenced code blocks', () => {
      const result = renderMarkdown('```\nconst x = 1;\n```');
      expect(result).toContain('<pre class="md-codeblock">');
      expect(result).toContain('const x = 1;');
    });

    it('includes language attribute', () => {
      const result = renderMarkdown('```js\nalert(1)\n```');
      expect(result).toContain('data-lang="js"');
    });
  });

  describe('lists', () => {
    it('renders unordered lists', () => {
      const result = renderMarkdown('- one\n- two\n- three');
      expect(result).toContain('<ul class="md-list">');
      expect(result).toContain('<li>one</li>');
      expect(result).toContain('<li>three</li>');
    });

    it('renders ordered lists', () => {
      const result = renderMarkdown('1. first\n2. second');
      expect(result).toContain('<ol class="md-list">');
      expect(result).toContain('<li>first</li>');
    });

    it('supports inline formatting in list items', () => {
      const result = renderMarkdown('- **bold** item');
      expect(result).toContain('<strong>bold</strong>');
    });
  });

  describe('blockquotes', () => {
    it('renders blockquotes', () => {
      const result = renderMarkdown('> quoted text');
      expect(result).toContain('<blockquote class="md-blockquote">');
      expect(result).toContain('quoted text');
    });

    it('handles multi-line blockquotes', () => {
      const result = renderMarkdown('> line one\n> line two');
      expect(result).toContain('line one');
      expect(result).toContain('line two');
    });
  });

  describe('horizontal rules', () => {
    it('renders --- as hr', () => {
      expect(renderMarkdown('---')).toContain('<hr class="md-hr">');
    });

    it('renders *** as hr', () => {
      expect(renderMarkdown('***')).toContain('<hr class="md-hr">');
    });
  });

  describe('tables', () => {
    it('renders a simple table', () => {
      const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |';
      const result = renderMarkdown(md);
      expect(result).toContain('<table class="md-table">');
      expect(result).toContain('<th');
      expect(result).toContain('Name');
      expect(result).toContain('<td');
      expect(result).toContain('Alice');
    });

    it('respects column alignment', () => {
      const md = '| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |';
      const result = renderMarkdown(md);
      expect(result).toContain('text-align:left');
      expect(result).toContain('text-align:center');
      expect(result).toContain('text-align:right');
    });
  });

  describe('XSS prevention', () => {
    it('escapes angle brackets in all contexts', () => {
      const result = renderMarkdown('# <img onerror=alert(1)>');
      expect(result).not.toContain('<img');
      expect(result).toContain('&lt;img');
    });

    it('escapes quotes', () => {
      const result = renderMarkdown('" onmouseover="alert(1)"');
      expect(result).toContain('&quot;');
    });
  });
});
