import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Skeleton, SkeletonCard, SkeletonTable, SkeletonList } from './SkeletonScreen';

describe('Skeleton Components', () => {
  describe('Skeleton', () => {
    it('renders basic skeleton', () => {
      render(<Skeleton />);
      expect(screen.getByRole('presentation')).toBeInTheDocument();
    });

    it('renders with text variant', () => {
      render(<Skeleton variant="text" />);
      const skeleton = screen.getByRole('presentation');
      expect(skeleton).toHaveClass('rounded');
    });

    it('renders with circular variant', () => {
      render(<Skeleton variant="circular" />);
      const skeleton = screen.getByRole('presentation');
      expect(skeleton).toHaveClass('rounded-full');
    });

    it('renders multiple lines for text variant', () => {
      render(<Skeleton variant="text" lines={3} />);
      const skeletons = screen.getAllByRole('presentation');
      expect(skeletons).toHaveLength(3);
    });

    it('applies custom dimensions', () => {
      render(<Skeleton width={100} height={50} />);
      const skeleton = screen.getByRole('presentation');
      expect(skeleton).toHaveStyle({ width: '100px', height: '50px' });
    });

    it('has proper accessibility attributes', () => {
      render(<Skeleton />);
      const skeleton = screen.getByRole('presentation');
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('SkeletonCard', () => {
    it('renders skeleton card with all elements', () => {
      render(<SkeletonCard />);
      const skeletons = screen.getAllByRole('presentation');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders without avatar when showAvatar is false', () => {
      render(<SkeletonCard showAvatar={false} />);
      const skeletons = screen.getAllByRole('presentation');
      // Should not have circular skeleton for avatar
      expect(skeletons.some(s => s.classList.contains('rounded-full'))).toBe(false);
    });

    it('renders without button when showButton is false', () => {
      render(<SkeletonCard showButton={false} />);
      const skeletons = screen.getAllByRole('presentation');
      // Should have fewer skeletons without button
      expect(skeletons.length).toBeLessThan(5); // Approximate check
    });

    it('applies custom className', () => {
      render(<SkeletonCard className="custom-card" />);
      const card = screen.getByRole('presentation').closest('.custom-card');
      expect(card).toBeInTheDocument();
    });
  });

  describe('SkeletonTable', () => {
    it('renders table with default rows and columns', () => {
      render(<SkeletonTable />);
      const skeletons = screen.getAllByRole('presentation');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders with custom rows and columns', () => {
      render(<SkeletonTable rows={3} columns={2} />);
      const skeletons = screen.getAllByRole('presentation');
      // Should have header + 3 rows * 2 columns
      expect(skeletons.length).toBe(8);
    });

    it('renders without header when showHeader is false', () => {
      render(<SkeletonTable showHeader={false} />);
      const skeletons = screen.getAllByRole('presentation');
      // Should have fewer skeletons without header
      expect(skeletons.length).toBeLessThan(25); // Default 5 rows * 4 columns + header
    });

    it('applies custom className', () => {
      render(<SkeletonTable className="custom-table" />);
      const table = screen.getByRole('presentation').closest('.custom-table');
      expect(table).toBeInTheDocument();
    });
  });

  describe('SkeletonList', () => {
    it('renders list with default items', () => {
      render(<SkeletonList />);
      const skeletons = screen.getAllByRole('presentation');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders with custom number of items', () => {
      render(<SkeletonList items={3} />);
      const skeletons = screen.getAllByRole('presentation');
      // Each item has avatar + 2 text skeletons
      expect(skeletons.length).toBe(9);
    });

    it('renders without avatar when showAvatar is false', () => {
      render(<SkeletonList showAvatar={false} />);
      const skeletons = screen.getAllByRole('presentation');
      // Should not have circular skeletons for avatars
      expect(skeletons.some(s => s.classList.contains('rounded-full'))).toBe(false);
    });

    it('renders with custom avatar size', () => {
      render(<SkeletonList avatarSize={60} />);
      const skeletons = screen.getAllByRole('presentation');
      const avatarSkeleton = skeletons.find(s => s.classList.contains('rounded-full'));
      expect(avatarSkeleton).toHaveStyle({ width: '60px', height: '60px' });
    });

    it('applies custom className', () => {
      render(<SkeletonList className="custom-list" />);
      const list = screen.getByRole('presentation').closest('.custom-list');
      expect(list).toBeInTheDocument();
    });
  });
});
