# To Start

1. Start Server by navigating to file directory and running: 
### node server.js

2. Start App by running:
### npm start

## Available Scripts

In the project directory, you can run:

## Elasticsearch configuration

Server side search now relies on Elasticsearch for indexing `Book` and `BookText` documents. Set the following environment variables before starting the API server:

- `ELASTICSEARCH_NODE` – required to enable Elasticsearch (e.g. `http://localhost:9200`). If this is omitted, the server falls back to MongoDB-only search.
- `ELASTICSEARCH_USERNAME` / `ELASTICSEARCH_PASSWORD` – optional basic auth credentials.
- `ELASTICSEARCH_BOOK_INDEX` – optional override for the books index name (defaults to `books`).
- `ELASTICSEARCH_BOOK_TEXT_INDEX` – optional override for the OCR/book text index name (defaults to `book_texts`).
- `ELASTICSEARCH_SKIP_VERIFY` – set to `true` only when your cluster uses a self-signed TLS certificate and you cannot import the CA. This disables HTTPS certificate verification.

Once configured, any updates to `Book` or `BookText` documents will be indexed automatically, and the `/books/search` plus `/ocr/books/search` routes will query Elasticsearch when available.

### Reindexing existing data

If you add Elasticsearch after books already exist, run `npm run reindexElasticsearch` once to push all current `Book` and `BookText` records into the search indices. The script requires both `MONGODB_URI` and `ELASTICSEARCH_NODE` to be set.

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
