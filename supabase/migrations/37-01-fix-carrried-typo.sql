-- Fix CARRRIED typo in motions table (extra R)
UPDATE motions SET result = 'CARRIED' WHERE result = 'CARRRIED';
