import * as React from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

type Item<T extends string> = {
  id: T;
  label: string;
  icon?: React.ElementType;
  color?: string;
};

function useClickAway(ref: React.RefObject<HTMLElement>, handler: (event: MouseEvent | TouchEvent) => void) {
  React.useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      when: 'beforeChildren',
      staggerChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: -8 },
  visible: {
    opacity: 1,
    y: 0,
  },
};

type FluidDropdownProps<T extends string> = {
  items: Array<Item<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
};

export function FluidDropdown<T extends string>({
  items,
  value,
  onChange,
  className,
  buttonClassName,
  menuClassName,
}: FluidDropdownProps<T>) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [hoveredId, setHoveredId] = React.useState<T | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useClickAway(dropdownRef as React.RefObject<HTMLElement>, () => setIsOpen(false));

  const selected = React.useMemo(
    () => items.find((x) => x.id === value) ?? items[0],
    [items, value]
  );

  const activeId = hoveredId ?? selected?.id;
  const activeIndex = Math.max(
    0,
    items.findIndex((c) => c.id === activeId)
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn('w-full max-w-xs relative', className)} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className={cn(
            'w-full h-10 px-3 rounded-xl border border-white/12 bg-[var(--glass-bg)] text-white/75',
            'inline-flex items-center justify-between text-sm transition-all duration-200',
            'hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20',
            isOpen && 'bg-white/10 text-white',
            buttonClassName
          )}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="flex items-center min-w-0">
            {selected?.icon ? <selected.icon className="w-4 h-4 mr-2 shrink-0" /> : null}
            <span className="truncate">{selected?.label ?? ''}</span>
          </span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-center w-5 h-5"
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{
                opacity: 1,
                y: 0,
                height: 'auto',
                transition: {
                  type: 'spring',
                  stiffness: 480,
                  damping: 30,
                  mass: 1,
                },
              }}
              exit={{
                opacity: 0,
                y: -6,
                height: 0,
                transition: { duration: 0.15 },
              }}
              className="absolute left-0 right-0 top-full mt-2 z-50 overflow-hidden"
            >
              <motion.div
                className={cn(
                  'w-full rounded-xl border border-white/12 bg-black/85 backdrop-blur-xl p-1 shadow-[0_16px_50px_rgba(0,0,0,0.45)]',
                  menuClassName
                )}
                initial={{ borderRadius: 10 }}
                animate={{ borderRadius: 14 }}
                style={{ transformOrigin: 'top' }}
              >
                <motion.div
                  className="py-1 relative"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <motion.div
                    layoutId="fluid-hover-highlight"
                    className="absolute inset-x-1 bg-white/10 rounded-md"
                    animate={{
                      y: activeIndex * 36,
                      height: 36,
                    }}
                    transition={{
                      type: 'spring',
                      bounce: 0.15,
                      duration: 0.45,
                    }}
                  />
                  {items.map((item) => {
                    const Icon = item.icon;
                    const selectedOrHovered = value === item.id || hoveredId === item.id;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onChange(item.id);
                          setIsOpen(false);
                        }}
                        onHoverStart={() => setHoveredId(item.id)}
                        onHoverEnd={() => setHoveredId(null)}
                        className={cn(
                          'relative flex w-full items-center px-3 py-2 text-sm rounded-md transition-colors',
                          selectedOrHovered ? 'text-white' : 'text-white/60'
                        )}
                        whileTap={{ scale: 0.98 }}
                        variants={itemVariants}
                      >
                        {Icon ? (
                          <span className="w-4 h-4 mr-2 shrink-0" style={{ color: selectedOrHovered ? item.color : undefined }}>
                            <Icon className="w-4 h-4" />
                          </span>
                        ) : null}
                        {item.label}
                      </motion.button>
                    );
                  })}
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
