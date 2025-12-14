/**
 * API Documentation Routes
 * 
 * Serves interactive API documentation using Swagger UI and Redoc
 * - /api-docs - Swagger UI (interactive, can test endpoints)
 * - /docs - Redoc (beautiful, read-only documentation)
 */

import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '../docs/swagger.config.js';

const router = express.Router();

// Swagger UI Options
const swaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Mediczy API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true
  }
};

// Serve Swagger spec as JSON
router.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Swagger UI - Interactive documentation
router.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, swaggerUiOptions)
);

// Redoc - Beautiful read-only documentation
router.get('/docs', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Mediczy API Documentation</title>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
        <style>
          body {
            margin: 0;
            padding: 0;
          }
        </style>
      </head>
      <body>
        <redoc spec-url='/swagger.json'></redoc>
        <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
      </body>
    </html>
  `);
});

// Root documentation page - redirects to Swagger UI
router.get('/', (req, res) => {
  res.redirect('/api-docs');
});

export default router;
