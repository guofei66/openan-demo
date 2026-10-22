/** Tailwind — same design tokens as the workflow designer (zinc / blue, class dark mode).
 *  Preflight is disabled so the plugin CSS never resets the host portal page;
 *  every visual element styles itself explicitly with utilities. */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,jsx}",
    ],
    corePlugins: {
        preflight: false,
    },
    theme: {
        extend: {},
    },
};
