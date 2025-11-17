DELIMITER $$

DROP PROCEDURE IF EXISTS GetPrograms $$
CREATE PROCEDURE GetPrograms()
BEGIN
  SELECT
    p.program_id,
    p.title,
    p.status,
    p.category_id,
    c.name AS category_name,
    p.host_company_id,
    hc.company_name,
    hc.company_phone,
    hc.address,
    p.start_date,
    p.end_date,
    p.goal_amount,
    COALESCE(SUM(CASE WHEN d.status = 'PAID' THEN d.amount ELSE 0 END), 0) AS total_amount,
    p.description,
    p.place
  FROM Program p
  LEFT JOIN Category c ON c.category_id = p.category_id
  LEFT JOIN Program_Host_Company hc ON hc.host_company_id = p.host_company_id
  LEFT JOIN Donation d ON d.program_id = p.program_id
  GROUP BY
    p.program_id, p.title, p.status, p.category_id, c.name,
    p.host_company_id, hc.company_name, hc.company_phone, hc.address,
    p.start_date, p.end_date, p.goal_amount, p.description, p.place
  ORDER BY p.end_date ASC, p.program_id ASC;
END $$

DROP PROCEDURE IF EXISTS search_programs $$
CREATE PROCEDURE search_programs(
    IN p_keyword   VARCHAR(255),
    IN p_category  VARCHAR(50),
    IN p_status    VARCHAR(20),
    IN p_sort      VARCHAR(20)
)
BEGIN
  DECLARE v_keyword VARCHAR(255);
  DECLARE v_category INT UNSIGNED;
  DECLARE v_status VARCHAR(20);

  SET v_keyword  = NULLIF(TRIM(p_keyword), '');
  SET v_category = CAST(NULLIF(TRIM(p_category), '') AS UNSIGNED);
  SET v_status   = UPPER(NULLIF(TRIM(p_status), ''));

  SELECT
    p.program_id,
    p.title,
    p.status,
    p.category_id,
    c.name AS category_name,
    p.host_company_id,
    hc.company_name,
    hc.company_phone,
    hc.address,
    p.start_date,
    p.end_date,
    p.goal_amount,
    COALESCE(SUM(CASE WHEN d.status = 'PAID' THEN d.amount ELSE 0 END), 0) AS total_amount,
    p.description,
    p.place
  FROM Program p
  LEFT JOIN Category c ON c.category_id = p.category_id
  LEFT JOIN Program_Host_Company hc ON hc.host_company_id = p.host_company_id
  LEFT JOIN Donation d ON d.program_id = p.program_id
  WHERE
    (v_keyword IS NULL OR
       p.title LIKE CONCAT('%', v_keyword, '%') OR
       p.description LIKE CONCAT('%', v_keyword, '%') OR
       hc.company_name LIKE CONCAT('%', v_keyword, '%') OR
       CAST(p.program_id AS CHAR) LIKE CONCAT('%', v_keyword, '%'))
    AND (v_category IS NULL OR p.category_id = v_category)
    AND (v_status IS NULL OR p.status = v_status)
  GROUP BY
    p.program_id, p.title, p.status, p.category_id, c.name,
    p.host_company_id, hc.company_name, hc.company_phone, hc.address,
    p.start_date, p.end_date, p.goal_amount, p.description, p.place
  ORDER BY
    CASE WHEN p_sort = 'deadline_desc' THEN p.end_date END DESC,
    CASE WHEN p_sort = 'deadline_asc' THEN p.end_date END ASC,
    CASE WHEN p_sort = 'start_desc' THEN p.start_date END DESC,
    CASE WHEN p_sort = 'start_asc' THEN p.start_date END ASC,
    CASE WHEN p_sort = 'amount_desc' THEN p.goal_amount END DESC,
    CASE WHEN p_sort = 'amount_asc' THEN p.goal_amount END ASC,
    p.end_date ASC,
    p.program_id ASC;
END $$

DELIMITER ;
