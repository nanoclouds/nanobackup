-- Add column to store write permission status
ALTER TABLE public.ftp_destinations 
ADD COLUMN write_permission boolean DEFAULT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN public.ftp_destinations.write_permission IS 'Stores the result of the last write permission test. NULL = never tested, true = can write, false = cannot write';