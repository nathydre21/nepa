import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe } from 'jest-axe';
import { Carousel } from './Carousel';

describe('Carousel Component', () => {
  const items = [
    { id: 1, content: <div data-testid="slide-1">Slide 1</div> },
    { id: 2, content: <div data-testid="slide-2">Slide 2</div> },
    { id: 3, content: <div data-testid="slide-3">Slide 3</div> },
  ];

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders correctly with given items', () => {
    render(<Carousel items={items} />);
    
    expect(screen.getByTestId('slide-1')).toBeInTheDocument();
    expect(screen.getByTestId('slide-2')).toBeInTheDocument();
    expect(screen.getByTestId('slide-3')).toBeInTheDocument();
  });

  it('navigates to next and previous slides when arrows are clicked', () => {
    render(<Carousel items={items} loop={false} />);
    
    const nextBtn = screen.getByLabelText('Next slide');
    const prevBtn = screen.getByLabelText('Previous slide');

    expect(screen.getByLabelText('Slide 1 of 3')).toHaveAttribute('aria-hidden', 'false');
    
    fireEvent.click(nextBtn);
    expect(screen.getByLabelText('Slide 2 of 3')).toHaveAttribute('aria-hidden', 'false');
    
    fireEvent.click(prevBtn);
    expect(screen.getByLabelText('Slide 1 of 3')).toHaveAttribute('aria-hidden', 'false');
  });

  it('navigates to specific slide when dot is clicked', () => {
    render(<Carousel items={items} />);
    
    const dot3 = screen.getByLabelText('Go to slide 3');
    fireEvent.click(dot3);
    
    expect(screen.getByLabelText('Slide 3 of 3')).toHaveAttribute('aria-hidden', 'false');
  });

  it('auto-plays when autoPlay is true', () => {
    render(<Carousel items={items} autoPlay={true} interval={3000} />);
    
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    
    expect(screen.getByLabelText('Slide 2 of 3')).toHaveAttribute('aria-hidden', 'false');
  });

  it('supports keyboard navigation', () => {
    render(<Carousel items={items} />);
    
    const carouselRegion = screen.getByRole('region');
    carouselRegion.focus();
    
    fireEvent.keyDown(carouselRegion, { key: 'ArrowRight' });
    expect(screen.getByLabelText('Slide 2 of 3')).toHaveAttribute('aria-hidden', 'false');
    
    fireEvent.keyDown(carouselRegion, { key: 'ArrowLeft' });
    expect(screen.getByLabelText('Slide 1 of 3')).toHaveAttribute('aria-hidden', 'false');
  });

  it('passes accessibility (axe) checks', async () => {
    jest.useRealTimers();
    const { container } = render(<Carousel items={items} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});