import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';


const mirrorApiMocks = vi.hoisted(() => ({
  mirrorGetWidgets: vi.fn(),
  mirrorPutWidgets: vi.fn(),
  mirrorAuthProviders: vi.fn(),
  mirrorAuthStartDeviceLogin: vi.fn(),
  mirrorAuthLogout: vi.fn(),
  mirrorOAuthWebStartUrl: vi.fn(),
  mirrorGetCalendarEvents: vi.fn(),
  mirrorGetCalendarTasks: vi.fn(),
}));

const wardrobeApiMocks = vi.hoisted(() => ({
  listClothingItems: vi.fn(),
  createClothingWithImage: vi.fn(),
  deleteClothingItem: vi.fn(),
  generateOutfitTryOn: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
}));


vi.mock('motion/react', () => {
  const createMotionComponent = (tag: string) =>
    React.forwardRef(
      (
        { children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode },
        ref,
      ) => {
        const {
          animate,
          exit,
          initial,
          layout,
          transition,
          whileHover,
          whileTap,
          ...domProps
        } = props as React.HTMLAttributes<HTMLElement> & Record<string, unknown>;
        void animate;
        void exit;
        void initial;
        void layout;
        void transition;
        void whileHover;
        void whileTap;
        return React.createElement(tag, { ...domProps, ref }, children);
      },
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: createMotionComponent('div'),
      span: createMotionComponent('span'),
      button: createMotionComponent('button'),
    },
  };
});

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: toastMocks,
}));

vi.mock('./lib/connectionManager', () => ({
  MirrorConnectionManager: class {
    connect() {}

    dispose() {}

    send() {
      return true;
    }

    getSessionId() {
      return 'session-1';
    }
  },
}));

vi.mock('./lib/connectionConfig', () => ({
  getMirrorHttpBase: () => 'http://mirror.test',
  getMirrorWsUrl: () => 'ws://mirror.test/ws/control',
  setMirrorHttpBase: vi.fn(),
  setMirrorWsUrl: vi.fn(),
}));

vi.mock('./components/WidgetSummaryPanel', () => ({
  WidgetSummaryPanel: () => <div>Widget Summary</div>,
}));

vi.mock('./components/ui/fluid-dropdown', () => ({
  FluidDropdown: ({
    items,
    value,
    onChange,
  }: {
    items: Array<{ id: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <select aria-label="dropdown" value={value} onChange={(event) => onChange(event.target.value)}>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('./features/camera/cameraApi', () => ({
  triggerMirrorCapture: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./features/wardrobe/useWardrobeActions', () => ({
  useWardrobeActions: () => ({
    notifyWardrobeUpdated: vi.fn(),
    clearDeletedSelection: vi.fn(),
  }),
}));

vi.mock('./lib/mirrorApi', () => mirrorApiMocks);

vi.mock('./features/wardrobe/clothingApi', () => ({
  CLOTHING_CATEGORIES: ['shirt', 'pants', 'accessories', 'other'],
  listClothingItems: wardrobeApiMocks.listClothingItems,
  createClothingWithImage: wardrobeApiMocks.createClothingWithImage,
  deleteClothingItem: wardrobeApiMocks.deleteClothingItem,
  generateOutfitTryOn: wardrobeApiMocks.generateOutfitTryOn,
  outfitSlotForCategory: (category: string) => {
    if (category === 'shirt') return 'shirt';
    if (category === 'pants') return 'pants';
    if (category === 'accessories') return 'accessories';
    return null;
  },
  personImageLatestUrl: (base: string) => `${base}/api/tryon/person-image/latest`,
  primaryImageUrl: (item: { images?: Array<{ image_url: string }> | null }) =>
    item.images?.[0]?.image_url ?? null,
}));

import App from './App';


beforeEach(() => {
  mirrorApiMocks.mirrorGetWidgets.mockResolvedValue([]);
  mirrorApiMocks.mirrorPutWidgets.mockResolvedValue([]);
  mirrorApiMocks.mirrorAuthProviders.mockResolvedValue([]);
  mirrorApiMocks.mirrorAuthStartDeviceLogin.mockResolvedValue(undefined);
  mirrorApiMocks.mirrorAuthLogout.mockResolvedValue(undefined);
  mirrorApiMocks.mirrorOAuthWebStartUrl.mockReturnValue('http://mirror.test/oauth/start');
  mirrorApiMocks.mirrorGetCalendarEvents.mockResolvedValue({
    events: [],
    providers: [],
    last_sync: null,
  });
  mirrorApiMocks.mirrorGetCalendarTasks.mockResolvedValue({
    tasks: [],
    providers: [],
    last_sync: null,
  });

  wardrobeApiMocks.listClothingItems.mockResolvedValue([]);
  wardrobeApiMocks.createClothingWithImage.mockReset();
  wardrobeApiMocks.deleteClothingItem.mockResolvedValue(undefined);
  wardrobeApiMocks.generateOutfitTryOn.mockResolvedValue({
    status: 'complete',
    generation_id: 'gen-1',
    image_url: 'http://mirror.test/generated/gen-1.png',
  });

  toastMocks.success.mockReset();
  toastMocks.error.mockReset();
  toastMocks.message.mockReset();
});


describe('App', () => {
  it('renders the main companion sections and empty wardrobe state', async () => {
    render(<App />);

    expect(await screen.findByText(/No wardrobe items yet/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wardrobe' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pose Capture' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Outfit generation' })).toBeInTheDocument();
    expect(screen.getByAltText('Latest person photo')).toHaveAttribute(
      'src',
      expect.stringContaining('http://mirror.test/api/tryon/person-image/latest'),
    );
  });

  it('renders existing wardrobe items from the mocked API', async () => {
    wardrobeApiMocks.listClothingItems.mockResolvedValue([
      {
        id: 7,
        name: 'Blue Shirt',
        category: 'shirt',
        created_at: '2026-04-26T12:00:00Z',
        updated_at: '2026-04-26T12:00:00Z',
        images: [{ image_url: 'https://cdn.example/blue-shirt.png' }],
      },
    ]);

    render(<App />);

    expect(await screen.findByAltText('Blue Shirt')).toBeInTheDocument();
    expect(screen.getByText('Blue Shirt')).toBeInTheDocument();
  });

  it('opens the upload modal and adds a new clothing card', async () => {
    wardrobeApiMocks.createClothingWithImage.mockResolvedValue({
      id: 11,
      name: 'linen-shirt',
      category: 'shirt',
      created_at: '2026-04-26T12:00:00Z',
      updated_at: '2026-04-26T12:00:00Z',
      images: [{ image_url: 'https://cdn.example/linen-shirt.png' }],
    });

    const user = userEvent.setup();
    const { container } = render(<App />);

    await screen.findByText(/No wardrobe items yet/i);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    await user.upload(fileInput!, new File(['shirt'], 'linen-shirt.png', { type: 'image/png' }));

    expect(await screen.findByText('Clothing details')).toBeInTheDocument();
    expect(screen.getByDisplayValue('linen-shirt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(wardrobeApiMocks.createClothingWithImage).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByAltText('linen-shirt')).toBeInTheDocument();
  });
});
