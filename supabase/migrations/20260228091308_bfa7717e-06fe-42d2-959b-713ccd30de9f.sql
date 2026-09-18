CREATE OR REPLACE FUNCTION public.is_gov_attester(wallet_addr text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN lower(wallet_addr) IN (
    -- Will
    lower('0xe32d50a0badE4cbD5B0d6120d3A5FD07f63694f1'),
    lower('0xfd0Da7a744245e7aCECCd786d5a743Ef9291a557'),
    lower('0x02D5578173bd0DB25462BB32A254Cd4b2E6D9a0D'),
    -- Wisdom
    lower('0xCa319fBc39F519822385F2D0a0114B14fa89A301'),
    lower('0xDf8249159BB67804D718bc8186f95B75CE5ECbe8'),
    lower('0x5102Ecc4a458a1af76aFA50d23359a712658a402'),
    lower('0xE3e97a95d3f61814473f6d1eEbBa8253286D65c5'),
    -- Love
    lower('0xE418a560611e80E4239F5513D41e583fC9AC2E6d'),
    lower('0x67464Df3082828b3Cf10C5Cb08FC24A28228EFd1'),
    lower('0x9ec8C51175526BEbB1D04100256De71CF99B7CCC'),
    lower('0x57a7943F2808Fc24b0403f25bb4670c5d84b3f2e')
  );
END;
$function$