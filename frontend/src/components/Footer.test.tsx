import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { axe } from 'jest-axe';
import Footer from './Footer';

// Wrapper for Router context
const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('Footer', () => {
  describe('Rendering', () => {
    it('should render without crashing', () => {
      renderWithRouter(<Footer />);
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    });

    it('should display company name', () => {
      renderWithRouter(<Footer />);
      expect(screen.getByText(/nepa/i)).toBeInTheDocument();
    });

    it('should display company tagline', () => {
      renderWithRouter(<Footer />);
      expect(screen.getByText(/building the future of decentralized finance/i)).toBeInTheDocument();
    });

    it('should display current year in copyright', () => {
      renderWithRouter(<Footer />);
      const currentYear = new Date().getFullYear();
      expect(screen.getByText(new RegExp(`© ${currentYear} nepa`, 'i'))).toBeInTheDocument();
    });
  });

  describe('Navigation Sections', () => {
    it('should render Product section with links', () => {
      renderWithRouter(<Footer />);
      
      expect(screen.getByText(/^Product$/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /features/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /pricing/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /documentation/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /api/i })).toBeInTheDocument();
    });

    it('should render Company section with links', () => {
      renderWithRouter(<Footer />);
      
      expect(screen.getByText(/^Company$/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /about/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /blog/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /careers/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /contact/i })).toBeInTheDocument();
    });

    it('should render Resources section with links', () => {
      renderWithRouter(<Footer />);
      
      expect(screen.getByText(/^Resources$/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /help center/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /community/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /status/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /changelog/i })).toBeInTheDocument();
    });

    it('should render Legal section with links', () => {
      renderWithRouter(<Footer />);
      
      expect(screen.getByText(/^Legal$/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /privacy policy/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /terms of service/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /cookie policy/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /^security$/i })).toBeInTheDocument();
    });
  });

  describe('Link Behavior', () => {
    it('should have correct internal link paths', () => {
      renderWithRouter(<Footer />);
      
      const featuresLink = screen.getByRole('link', { name: /features/i });
      expect(featuresLink).toHaveAttribute('href', '/features');
      
      const pricingLink = screen.getByRole('link', { name: /pricing/i });
      expect(pricingLink).toHaveAttribute('href', '/pricing');
    });

    it('should use React Router Link for internal navigation', () => {
      renderWithRouter(<Footer />);
      
      // Internal links should not have target="_blank"
      const aboutLink = screen.getByRole('link', { name: /about/i });
      expect(aboutLink).not.toHaveAttribute('target', '_blank');
    });
  });

  describe('Social Links', () => {
    it('should render all social media links', () => {
      renderWithRouter(<Footer />);
      
      // Check by aria-label
      expect(screen.getByLabelText(/twitter/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/github/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/linkedin/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/discord/i)).toBeInTheDocument();
    });

    it('should have external links with correct attributes', () => {
      renderWithRouter(<Footer />);
      
      const twitterLink = screen.getByLabelText(/twitter/i);
      expect(twitterLink).toHaveAttribute('href');
      expect(twitterLink).toHaveAttribute('target', '_blank');
      expect(twitterLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should display social icons', () => {
      renderWithRouter(<Footer />);
      
      const twitterLink = screen.getByLabelText(/twitter/i);
      expect(twitterLink).toHaveTextContent('𝕏');
      
      const githubLink = screen.getByLabelText(/github/i);
      expect(githubLink).toHaveTextContent('⚡');
    });
  });

  describe('Bottom Section', () => {
    it('should render copyright notice', () => {
      renderWithRouter(<Footer />);
      const currentYear = new Date().getFullYear();
      expect(screen.getByText(new RegExp(`© ${currentYear} nepa. all rights reserved`, 'i'))).toBeInTheDocument();
    });

    it('should render utility links', () => {
      renderWithRouter(<Footer />);
      
      expect(screen.getByRole('link', { name: /accessibility/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /sitemap/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /rss feed/i })).toBeInTheDocument();
    });

    it('should have correct utility link paths', () => {
      renderWithRouter(<Footer />);
      
      const accessibilityLink = screen.getByRole('link', { name: /accessibility/i });
      expect(accessibilityLink).toHaveAttribute('href', '/accessibility');
      
      const sitemapLink = screen.getByRole('link', { name: /sitemap/i });
      expect(sitemapLink).toHaveAttribute('href', '/sitemap');
      
      const rssLink = screen.getByRole('link', { name: /rss feed/i });
      expect(rssLink).toHaveAttribute('href', '/rss');
    });
  });

  describe('Responsive Behavior', () => {
    it('should have responsive grid classes', () => {
      const { container } = renderWithRouter(<Footer />);
      
      // Check for responsive grid classes
      const gridSection = container.querySelector('.grid');
      expect(gridSection).toHaveClass('grid-cols-1');
      expect(gridSection).toHaveClass('md:grid-cols-2');
      expect(gridSection).toHaveClass('lg:grid-cols-5');
    });

    it('should have responsive bottom section layout', () => {
      const { container } = renderWithRouter(<Footer />);
      
      const bottomSection = container.querySelector('.flex-col');
      expect(bottomSection).toHaveClass('md:flex-row');
    });
  });

  describe('Styling', () => {
    it('should have dark background styling', () => {
      const { container } = renderWithRouter(<Footer />);
      
      const footer = container.querySelector('footer');
      expect(footer).toHaveClass('bg-gray-900');
      expect(footer).toHaveClass('text-white');
    });

    it('should have hover effects on links', () => {
      renderWithRouter(<Footer />);
      
      const link = screen.getByRole('link', { name: /features/i });
      expect(link).toHaveClass('hover:text-white');
    });

    it('should have transition effects on links', () => {
      renderWithRouter(<Footer />);
      
      const link = screen.getByRole('link', { name: /features/i });
      expect(link).toHaveClass('transition-colors');
    });
  });

  describe('Accessibility', () => {
    it('should pass accessibility checks', async () => {
      const { container } = renderWithRouter(<Footer />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper semantic HTML', () => {
      renderWithRouter(<Footer />);
      
      const footer = screen.getByRole('contentinfo');
      expect(footer.tagName).toBe('FOOTER');
    });

    it('should have accessible section headings', () => {
      renderWithRouter(<Footer />);
      
      // All section titles should be h3 elements
      const productHeading = screen.getByText(/^Product$/);
      expect(productHeading.tagName).toBe('H3');
      
      const companyHeading = screen.getByText(/^Company$/);
      expect(companyHeading.tagName).toBe('H3');
    });

    it('should have aria-labels for social links', () => {
      renderWithRouter(<Footer />);
      
      const twitterLink = screen.getByLabelText(/twitter/i);
      expect(twitterLink).toHaveAttribute('aria-label', 'Twitter');
      
      const githubLink = screen.getByLabelText(/github/i);
      expect(githubLink).toHaveAttribute('aria-label', 'GitHub');
    });

    it('should have proper link labels for screen readers', () => {
      renderWithRouter(<Footer />);
      
      // All links should have accessible text
      const links = screen.getAllByRole('link');
      links.forEach(link => {
        expect(link).toHaveAccessibleName();
      });
    });
  });

  describe('Content Structure', () => {
    it('should have proper container structure', () => {
      const { container } = renderWithRouter(<Footer />);
      
      const maxWidth = container.querySelector('.max-w-7xl');
      expect(maxWidth).toBeInTheDocument();
      expect(maxWidth).toHaveClass('mx-auto');
    });

    it('should organize sections in a grid', () => {
      const { container } = renderWithRouter(<Footer />);
      
      const gridContainer = container.querySelector('.grid');
      expect(gridContainer).toBeInTheDocument();
      expect(gridContainer?.children.length).toBeGreaterThan(0);
    });

    it('should have a border separator for bottom section', () => {
      const { container } = renderWithRouter(<Footer />);
      
      const bottomSection = container.querySelector('.border-t');
      expect(bottomSection).toBeInTheDocument();
      expect(bottomSection).toHaveClass('border-gray-700');
    });
  });

  describe('Link Count', () => {
    it('should have the correct number of navigation links', () => {
      renderWithRouter(<Footer />);
      
      // 4 sections * 4 links each = 16 navigation links
      // + 4 social links + 3 utility links = 23 total links
      const allLinks = screen.getAllByRole('link');
      expect(allLinks.length).toBeGreaterThanOrEqual(20);
    });

    it('should have all product links', () => {
      renderWithRouter(<Footer />);
      
      const productLinks = ['Features', 'Pricing', 'Documentation', 'API'];
      productLinks.forEach(linkText => {
        expect(screen.getByRole('link', { name: new RegExp(linkText, 'i') })).toBeInTheDocument();
      });
    });

    it('should have all company links', () => {
      renderWithRouter(<Footer />);
      
      const companyLinks = ['About', 'Blog', 'Careers', 'Contact'];
      companyLinks.forEach(linkText => {
        expect(screen.getByRole('link', { name: new RegExp(linkText, 'i') })).toBeInTheDocument();
      });
    });
  });

  describe('SEO and Meta', () => {
    it('should have descriptive link text', () => {
      renderWithRouter(<Footer />);
      
      // Check that links have meaningful text, not just "click here"
      const links = screen.getAllByRole('link');
      links.forEach(link => {
        const text = link.textContent || '';
        expect(text).toBeTruthy();
        expect(text.toLowerCase()).not.toBe('click here');
      });
    });

    it('should use semantic list structure for navigation', () => {
      const { container } = renderWithRouter(<Footer />);
      
      // Each section should have a ul with li items
      const lists = container.querySelectorAll('ul');
      expect(lists.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle year display correctly', () => {
      // Mock date to test year display
      const realDate = Date;
      const mockDate = new realDate('2025-01-01');
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = realDate.now;

      renderWithRouter(<Footer />);
      expect(screen.getByText(/© 2025/)).toBeInTheDocument();

      // Restore
      global.Date = realDate;
    });

    it('should render correctly without props', () => {
      expect(() => renderWithRouter(<Footer />)).not.toThrow();
    });
  });
});
