import { query } from './connect_db.js';

export const getProducts = () => {
  return query('SELECT * FROM products');
};
