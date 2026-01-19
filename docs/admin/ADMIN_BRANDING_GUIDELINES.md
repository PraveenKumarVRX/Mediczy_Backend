# Mediqzy Admin Branding Guidelines

## Quick Reference for Developers

### Brand Colors

#### Primary (Teal)
Use teal for all primary actions, brand elements, and active states.

```tsx
// Buttons - Primary Actions
className="bg-teal-500 hover:bg-teal-600"          // Standard primary button
className="bg-gradient-to-r from-teal-500 to-teal-600"  // Gradient button

// Icons & Badges
className="text-teal-600 dark:text-teal-400"      // Icon color
className="bg-teal-500/10 text-teal-600"          // Badge/pill

// Active States
className="bg-teal-500/20 border border-teal-500/30"  // Active navigation item
className="text-teal-400"                         // Active text (dark mode)
```

#### Secondary (Slate)
Use slate for backgrounds, neutral elements, and dark theme.

```tsx
// Backgrounds
className="bg-slate-50 dark:bg-slate-950"         // Page background
className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800"  // Hero banner

// Borders & Dividers
className="border-slate-200 dark:border-slate-800"

// Subtle Backgrounds
className="bg-slate-500/5"                        // Very light overlay
```

#### Accent Colors
Use these for specific contexts only:

```tsx
// Success / Positive
className="text-emerald-600"                      // Success message
className="bg-emerald-500/10"                     // Success background

// Warning / Attention
className="text-amber-600"                        // Warning text
className="bg-amber-500/10"                       // Warning background

// Error / Destructive
className="text-red-600"                          // Error text
className="bg-red-500/10"                         // Error background

// Info / Secondary Actions
className="text-blue-600"                         // Info text
className="bg-blue-500/10"                        // Info background
```

### Common Patterns

#### Hero Section (Top of Page)
```tsx
<div className="relative bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 text-white overflow-hidden">
  <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" />
  <div className="relative container mx-auto px-4 py-8 lg:py-12">
    {/* Brand badge */}
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 mb-4">
      <HeartPulse className="h-4 w-4 text-teal-400" />
      <span className="text-sm text-teal-400 font-medium">{BRAND.name}</span>
    </div>
    
    {/* Title with teal highlight */}
    <h1 className="text-3xl lg:text-4xl font-bold mb-2">
      Welcome, <span className="text-teal-400">User</span>
    </h1>
  </div>
</div>
```

#### Stats Card
```tsx
<Card className="group hover:shadow-lg transition-all duration-300">
  <CardContent className="p-6">
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <p className="text-sm font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wide">
          Total Users
        </p>
        <p className="text-3xl font-bold text-foreground">1,248</p>
      </div>
      <div className="p-3 rounded-xl bg-teal-500/10 group-hover:bg-teal-500/20 transition-colors">
        <Users className="h-6 w-6 text-teal-600 dark:text-teal-400" />
      </div>
    </div>
  </CardContent>
</Card>
```

#### Navigation Active State
```tsx
<Link
  to="/admin/dashboard"
  className={cn(
    "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all",
    isActive
      ? "bg-gradient-to-r from-teal-500/20 to-teal-600/10 text-teal-400 border border-teal-500/30"
      : "text-muted-foreground hover:bg-accent hover:text-foreground"
  )}
>
  {isActive && (
    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-teal-500 rounded-r-full" />
  )}
  <Icon className={isActive ? "text-teal-400" : "text-muted-foreground"} />
  <span>Dashboard</span>
</Link>
```

#### Primary Button
```tsx
// Standard
<Button className="bg-teal-500 hover:bg-teal-600">
  Save Changes
</Button>

// Gradient (Premium look)
<Button className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700">
  Create New
</Button>

// With icon
<Button className="bg-teal-500 hover:bg-teal-600 gap-2">
  <Plus className="h-4 w-4" />
  Add Item
</Button>
```

#### Icon Backgrounds
```tsx
{/* Small icon badge */}
<div className="p-2 rounded-lg bg-teal-500/10">
  <Icon className="h-4 w-4 text-teal-600" />
</div>

{/* Logo icon with gradient */}
<div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/20">
  <HeartPulse className="h-5 w-5 text-white" />
</div>
```

### Migration Guide

#### Replace Blue/Purple with Teal
```tsx
// OLD (Don't use)
className="bg-blue-600 hover:bg-blue-700"
className="text-blue-600"
className="bg-gradient-to-r from-blue-600 to-purple-600"
className="border-blue-500/30"

// NEW (Use these)
className="bg-teal-500 hover:bg-teal-600"
className="text-teal-600 dark:text-teal-400"
className="bg-gradient-to-r from-teal-500 to-teal-600"
className="border-teal-500/30"
```

#### Hero Banners
```tsx
// OLD
className="bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700"

// NEW
className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900"
```

#### Active States
```tsx
// OLD
className="bg-blue-500/20 text-blue-600"

// NEW
className="bg-teal-500/20 text-teal-400"
```

### Brand Component Usage

Import the brand config:
```tsx
import { BRAND } from '@/config/brand';

// Use in JSX
<span>{BRAND.name}</span>              // "Mediqzy"
<span>{BRAND.fullName}</span>          // "Mediqzy Healthcare"
<span>{BRAND.tagline}</span>           // "Your Health, Our Priority"
<span>{BRAND.support.email}</span>     // "support@mediqzy.com"
```

### Color Utility Reference

```tsx
// Teal Shades (Primary Brand)
teal-50      // Lightest (backgrounds)
teal-100
teal-200
teal-300
teal-400     // Active text (dark mode)
teal-500     // Main brand color
teal-600     // Text, strong accents
teal-700
teal-800
teal-900     // Darkest

// Opacity Variants (for overlays/backgrounds)
teal-500/5   // 5% opacity
teal-500/10  // 10% opacity - icon backgrounds
teal-500/20  // 20% opacity - active states
teal-500/30  // 30% opacity - borders
```

### Do's and Don'ts

#### ✅ DO
- Use teal for primary actions and brand elements
- Use slate for backgrounds and neutral elements
- Include dark mode variants for all gradients
- Maintain consistent spacing (gap-4, p-6, space-y-6)
- Add hover effects for interactive elements
- Use semantic colors (emerald for success, red for errors)

#### ❌ DON'T
- Don't use blue/purple for primary actions
- Don't mix different primary colors randomly
- Don't forget dark mode styles
- Don't use hard-coded hex colors (use Tailwind classes)
- Don't override brand colors without reason
- Don't use teal for errors or warnings (use red/amber)

### Accessibility

Always ensure proper contrast:
```tsx
// Good contrast examples
className="bg-teal-500 text-white"           // White text on teal
className="text-teal-600 dark:text-teal-400" // Adapts to theme
className="border border-teal-500/30"        // Visible but subtle

// Bad contrast (avoid)
className="bg-teal-100 text-teal-200"        // Too similar
className="text-teal-500 dark:text-teal-500" // Same in both themes
```

### Component Library

Use these pre-styled components from `/components/ui/`:
- `Button` with `variant="default"` for primary actions
- `Card` for content containers
- `Badge` with custom teal classes
- `Avatar` with teal fallback gradient

### Testing Checklist

When updating a page:
- [ ] Check light mode appearance
- [ ] Check dark mode appearance
- [ ] Verify hover states work
- [ ] Ensure responsive design
- [ ] Test with different screen sizes
- [ ] Confirm branding is consistent
- [ ] Validate accessibility contrast

---

**Last Updated**: January 15, 2025
**Version**: 2.0
**Brand**: Mediqzy Healthcare
