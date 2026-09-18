
UPDATE public.sbt_issuance_rules SET display_name = '100 Ngày Bền Bỉ' WHERE sbt_type = '100_day_consistency';
UPDATE public.sbt_issuance_rules SET display_name = 'Vượt Qua Sàng Lọc Sybil' WHERE sbt_type = 'anti_sybil_passed';
UPDATE public.sbt_issuance_rules SET display_name = 'Người Kiến Tạo' WHERE sbt_type = 'builder';
UPDATE public.sbt_issuance_rules SET display_name = 'Lịch Sử Trong Sạch' WHERE sbt_type = 'clean_history';
UPDATE public.sbt_issuance_rules SET display_name = 'Đề Xuất Đầu Tiên Được Thông Qua' WHERE sbt_type = 'first_proposal_adopted';
UPDATE public.sbt_issuance_rules SET display_name = 'Kiến Trúc Sư Nền Móng', description = 'Người kiến tạo nền móng — di sản hệ sinh thái' WHERE sbt_type = 'foundational_builder';
UPDATE public.sbt_issuance_rules SET display_name = 'Hoàn Thành Lộ Trình Học' WHERE sbt_type = 'learning_path_complete';
UPDATE public.sbt_issuance_rules SET display_name = 'Mentor Được Chứng Nhận' WHERE sbt_type = 'mentor_certified';
UPDATE public.sbt_issuance_rules SET display_name = 'Người Tận Tâm 30 Ngày' WHERE sbt_type = 'quest_devotee_30d';
UPDATE public.sbt_issuance_rules SET display_name = 'Ánh Sáng Đầu Tiên' WHERE sbt_type = 'quest_first_light';
UPDATE public.sbt_issuance_rules SET display_name = 'Quester Tiên Phong' WHERE sbt_type = 'quest_founding';
UPDATE public.sbt_issuance_rules SET display_name = 'Người Mang Ánh Sáng' WHERE sbt_type = 'quest_light_bringer';
UPDATE public.sbt_issuance_rules SET display_name = 'Hành Giả 7 Ngày' WHERE sbt_type = 'quest_pilgrim_7d';
UPDATE public.sbt_issuance_rules SET display_name = 'Người Thật Đã Xác Minh' WHERE sbt_type = 'verified_human';
