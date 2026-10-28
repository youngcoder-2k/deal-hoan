export type HelpSection = { id: string; title: string; paragraphs: string[] };
export type HelpArticle = { slug: string; title: string; description: string; category: string; sections: HelpSection[] };
// DealHoàn-authored help copy. Policy values reflect the current application, not other services.
export const helpArticles: HelpArticle[] = [
  {
    "slug": "hoan-tien-shopee",
    "title": "Hoàn tiền Shopee là gì?",
    "description": "Cách kiểm tra khoản hoàn và mua hàng Shopee qua DealHoàn.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Hiểu đúng về khoản hoàn",
        "paragraphs": [
          "Đây là một phần hoa hồng tiếp thị được chia lại cho người mua khi đơn hàng đáp ứng điều kiện. Khoản dự kiến không phải tiền giảm trực tiếp tại bước thanh toán."
        ]
      },
      {
        "id": "phan-2",
        "title": "Từ link sản phẩm đến đơn hàng",
        "paragraphs": [
          "Sao chép liên kết của sản phẩm từ Shopee, dán vào ô tính tại trang chủ DealHoàn. Kiểm tra tên sản phẩm và khoản hoàn dự kiến.",
          "Đăng nhập trước khi mua. Chọn Mua ngay hoặc dùng link nhận hoàn mới được tạo; hoàn tất đặt hàng trên Shopee."
        ]
      },
      {
        "id": "phan-3",
        "title": "Giữ đúng nguồn ghi nhận",
        "paragraphs": [
          "Sau khi mở link nhận hoàn, không chuyển qua liên kết tiếp thị khác. Không xóa sản phẩm đã thêm từ link hoàn tiền. Giữ lại thông tin đơn để kiểm tra khi cần."
        ]
      },
      {
        "id": "phan-4",
        "title": "Theo dõi và rút tiền",
        "paragraphs": [
          "Đơn cần được sàn và đối tác đối soát. Chỉ số dư đã được duyệt mới dùng để rút; mức yêu cầu tối thiểu hiện tại là 10.000đ. Đơn hủy hoặc trả hàng có thể bị loại."
        ]
      }
    ]
  },
  {
    "slug": "hoan-tien-shopeefood",
    "title": "Hoàn tiền ShopeeFood",
    "description": "Kiểm tra link quán, điều kiện và khoản hoàn trước khi đặt món.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Bắt đầu từ link quán",
        "paragraphs": [
          "Trong ShopeeFood, mở quán hoặc món muốn đặt, chọn chia sẻ và sao chép liên kết. Dán liên kết vào DealHoàn để kiểm tra khả năng hỗ trợ."
        ]
      },
      {
        "id": "phan-2",
        "title": "Kiểm tra trước khi thanh toán",
        "paragraphs": [
          "Chỉ tiếp tục khi hệ thống trả về link nhận hoàn hợp lệ. Nếu không có kết quả, không mặc định rằng đơn sẽ được hoàn. Voucher, khu vực, tài khoản và chiến dịch có thể ảnh hưởng điều kiện."
        ]
      },
      {
        "id": "phan-3",
        "title": "Đặt món qua link mới",
        "paragraphs": [
          "Mở liên kết do DealHoàn tạo, kiểm tra đúng quán và hoàn tất đơn trên ứng dụng của sàn. Tránh mở thêm các link tiếp thị khác trước khi đặt."
        ]
      },
      {
        "id": "phan-4",
        "title": "Khi nào có tiền?",
        "paragraphs": [
          "Mức hiển thị là ước tính. Kết quả cuối cùng phụ thuộc đơn hợp lệ và xác nhận của đối tác; theo dõi trạng thái trong tài khoản thay vì chỉ dựa vào ảnh chụp lúc kiểm tra."
        ]
      }
    ]
  },
  {
    "slug": "cach-san-ma-giam-gia-shopee",
    "title": "Cách săn mã giảm giá Shopee",
    "description": "Kết hợp voucher và khoản hoàn mà vẫn kiểm soát số tiền thực trả.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Kiểm tra điều kiện mã",
        "paragraphs": [
          "Xem hạn dùng, giá trị đơn tối thiểu, ngành hàng, người bán và phương thức thanh toán. Mã nhìn giống nhau có thể áp dụng cho các nhóm khách khác nhau."
        ]
      },
      {
        "id": "phan-2",
        "title": "So giá sau khi áp mã",
        "paragraphs": [
          "Tính cả phí vận chuyển và phần ưu đãi thực sự áp dụng. Không chỉ nhìn giá gạch ngang hoặc tỷ lệ giảm được quảng bá."
        ]
      },
      {
        "id": "phan-3",
        "title": "Mua qua đúng link",
        "paragraphs": [
          "Chuẩn bị mã trước, sau đó quay lại DealHoàn tạo link nhận hoàn mới để mua. Việc bấm thêm banner hoặc link tiếp thị có thể đổi nguồn ghi nhận."
        ]
      },
      {
        "id": "phan-4",
        "title": "Khoản hoàn có thể thay đổi",
        "paragraphs": [
          "Giảm giá và các khoản bị loại có thể làm thay đổi giá trị đơn được tính hoa hồng. Chỉ coi số tiền ở bước kiểm tra là dự kiến, không cộng hai loại ưu đãi như một cam kết."
        ]
      }
    ]
  },
  {
    "slug": "cashback-shopee-la-gi",
    "title": "Cashback Shopee là gì?",
    "description": "Phân biệt hoàn tiền, giảm giá và tiền đã được duyệt.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Cashback khác giảm trực tiếp",
        "paragraphs": [
          "Giảm giá làm giảm số tiền cần trả lúc mua. Cashback chỉ được xác nhận sau khi đơn hoàn tất điều kiện; bạn thường vẫn thanh toán đầy đủ cho sàn."
        ]
      },
      {
        "id": "phan-2",
        "title": "Vì sao có hoa hồng?",
        "paragraphs": [
          "Nguồn tiếp thị có thể được đối tác trả hoa hồng cho giao dịch đủ điều kiện. DealHoàn chia một phần khoản đó cho người mua, theo kết quả ghi nhận và đối soát."
        ]
      },
      {
        "id": "phan-3",
        "title": "Dự kiến không phải số dư rút được",
        "paragraphs": [
          "Số tiền hiển thị trước khi mua giúp bạn tham khảo. Số dư chờ duyệt chưa được dùng để yêu cầu rút; đơn hủy, trả hoặc sai nguồn ghi nhận có thể không được tính."
        ]
      },
      {
        "id": "phan-4",
        "title": "Điều cần kiểm tra",
        "paragraphs": [
          "Đọc điều kiện đơn, mức rút tối thiểu, trạng thái ví và thông tin bảo mật. Bạn mua trên sàn; không đưa mật khẩu sàn hay mã OTP cho bên khác."
        ]
      }
    ]
  },
  {
    "slug": "app-hoan-tien-uy-tin",
    "title": "Cách chọn nền tảng hoàn tiền",
    "description": "Các tiêu chí nên kiểm tra trước khi chọn nơi nhận cashback.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Đừng chỉ so phần trăm",
        "paragraphs": [
          "So cả giới hạn tiền hoàn, loại khách hàng, sản phẩm áp dụng và giá trị đơn hợp lệ. Tỷ lệ cao nhất không nhất thiết dành cho đơn của bạn."
        ]
      },
      {
        "id": "phan-2",
        "title": "Ưu tiên thông tin kiểm chứng được",
        "paragraphs": [
          "Tìm điều khoản, chính sách quyền riêng tư, cách theo dõi đơn và quy trình rút. Phân biệt ảnh minh họa, tiền chờ duyệt và số dư thực tế."
        ]
      },
      {
        "id": "phan-3",
        "title": "Giữ tài khoản an toàn",
        "paragraphs": [
          "Đăng nhập qua luồng xác thực chính thức. Không cung cấp mật khẩu Google hoặc sàn cho người tự nhận là nhân viên; không chuyển tiền để mở khóa một khoản hoàn."
        ]
      },
      {
        "id": "phan-4",
        "title": "Thử một giao dịch phù hợp",
        "paragraphs": [
          "Kiểm tra link, giữ lại mã đơn và quan sát quy trình đối soát. Không xem những lời hứa hoàn tức thì hoặc tặng thưởng ở nền tảng khác là chính sách của DealHoàn."
        ]
      }
    ]
  },
  {
    "slug": "cach-san-sale-shopee",
    "title": "Cách săn sale Shopee",
    "description": "Chuẩn bị giỏ hàng, voucher và link mua để tiết kiệm có kế hoạch.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Lập danh sách cần mua",
        "paragraphs": [
          "Ghi lại sản phẩm, phiên bản, cửa hàng và ngân sách. Đối chiếu giá của cùng một mẫu trước ngày mua để tránh bị hấp dẫn bởi giá gạch ngang."
        ]
      },
      {
        "id": "phan-2",
        "title": "Xem lịch trong ứng dụng sàn",
        "paragraphs": [
          "Khung giờ và ưu đãi do sàn hoặc cửa hàng công bố có thể thay đổi. Kiểm tra trực tiếp thay vì coi một khung giờ cố định là luôn có deal tốt."
        ]
      },
      {
        "id": "phan-3",
        "title": "Kiểm tra link trước khi chốt",
        "paragraphs": [
          "Khi đã chọn đúng sản phẩm, dán link vào DealHoàn để xem khoản hoàn dự kiến. Đăng nhập và mua bằng link mới được tạo."
        ]
      },
      {
        "id": "phan-4",
        "title": "Không bỏ qua tổng chi phí",
        "paragraphs": [
          "So giá sau mã, phí giao hàng và điều kiện đổi trả. Khoản hoàn chỉ là một phần của quyết định mua, không thay thế việc kiểm tra chất lượng sản phẩm."
        ]
      }
    ]
  },
  {
    "slug": "ma-giam-gia-shopeefood",
    "title": "Mã giảm giá ShopeeFood",
    "description": "Cách chọn voucher đồ ăn và kiểm tra điều kiện nhận hoàn.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Đúng quán, đúng điều kiện",
        "paragraphs": [
          "Voucher có thể giới hạn theo quán, vị trí, khung giờ, giá trị đơn hoặc khách mới. Đọc điều kiện trong ứng dụng trước khi chọn."
        ]
      },
      {
        "id": "phan-2",
        "title": "Tính tổng tiền cuối cùng",
        "paragraphs": [
          "So tiền món, phí giao hàng, phí dịch vụ và phần được giảm. Một mã có tỷ lệ lớn chưa chắc cho tổng thanh toán thấp nhất."
        ]
      },
      {
        "id": "phan-3",
        "title": "Kiểm tra link nhận hoàn",
        "paragraphs": [
          "Dán link quán hoặc món vào DealHoàn. Chỉ mua với kỳ vọng cashback khi hệ thống cung cấp kết quả và liên kết phù hợp."
        ]
      },
      {
        "id": "phan-4",
        "title": "Theo dõi sau khi đặt",
        "paragraphs": [
          "Giữ mã đơn và xem trạng thái ghi nhận. Khuyến mãi của sàn và tiền hoàn của DealHoàn là hai chương trình khác nhau, mỗi chương trình có điều kiện riêng."
        ]
      }
    ]
  },
  {
    "slug": "hoan-tien-tiktok-shop",
    "title": "Hoàn tiền TikTok Shop",
    "description": "Sao chép link sản phẩm TikTok Shop và kiểm tra trên DealHoàn.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Lấy đúng link sản phẩm",
        "paragraphs": [
          "Mở trang sản phẩm trong TikTok Shop, chọn chia sẻ rồi sao chép liên kết. Link hồ sơ, video hoặc livestream không phải lúc nào cũng xác định được một sản phẩm."
        ]
      },
      {
        "id": "phan-2",
        "title": "Xem kết quả của chính link đó",
        "paragraphs": [
          "Dán link vào DealHoàn, kiểm tra sản phẩm và khoản hoàn được trả về. Không áp dụng tỷ lệ của sản phẩm khác cho món đang mua."
        ]
      },
      {
        "id": "phan-3",
        "title": "Tiếp tục mua trên TikTok",
        "paragraphs": [
          "Đăng nhập DealHoàn trước khi mua và dùng liên kết nhận hoàn mới. Đặt hàng, thanh toán trong TikTok Shop; tránh bấm sang nguồn tiếp thị khác trước khi hoàn tất."
        ]
      },
      {
        "id": "phan-4",
        "title": "Đối soát và giới hạn",
        "paragraphs": [
          "Dữ liệu và quyền truy cập có thể thay đổi theo đối tác. Không coi một kết quả ước tính là cam kết; số tiền cuối cùng dựa trên giao dịch được xác nhận."
        ]
      }
    ]
  },
  {
    "slug": "cashback-tiktok-shop-la-gi",
    "title": "Cashback TikTok Shop là gì?",
    "description": "Hiểu khoản hoàn khi mua sản phẩm trên TikTok Shop.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Bản chất khoản hoàn",
        "paragraphs": [
          "Cashback là khoản được chia lại từ hoa hồng của giao dịch hợp lệ, không phải TikTok tự động giảm giá ở mọi đơn hàng."
        ]
      },
      {
        "id": "phan-2",
        "title": "Vì sao mức hoàn khác nhau?",
        "paragraphs": [
          "Sản phẩm, nhà bán, chương trình và điều kiện ghi nhận có thể khác nhau. Hãy kiểm tra link ngay trước khi mua, không dùng tỷ lệ cũ như một mức cố định."
        ]
      },
      {
        "id": "phan-3",
        "title": "Khi nào rút được?",
        "paragraphs": [
          "Bạn cần phân biệt kết quả dự kiến, đơn chờ duyệt và số dư đã duyệt. Việc rút chỉ sử dụng số dư đủ điều kiện; đơn hủy hoặc trả có thể bị loại."
        ]
      }
    ]
  },
  {
    "slug": "shopeefood-co-hoan-tien-khong",
    "title": "ShopeeFood có hoàn tiền không?",
    "description": "Điều kiện kiểm tra cashback cho đơn đặt đồ ăn.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Không tự áp dụng cho mọi đơn",
        "paragraphs": [
          "Chỉ những đơn đáp ứng chương trình và được đối tác ghi nhận mới có thể nhận hoàn. Việc đã dùng voucher không chứng minh rằng đơn có cashback."
        ]
      },
      {
        "id": "phan-2",
        "title": "Cách kiểm tra",
        "paragraphs": [
          "Sao chép link quán hoặc món, dán vào DealHoàn và xem thông báo trả về. Nếu hệ thống chưa hỗ trợ link, không mặc định đơn sẽ được hoàn."
        ]
      },
      {
        "id": "phan-3",
        "title": "Sau khi đặt",
        "paragraphs": [
          "Theo dõi đơn trong tài khoản. Hủy đơn, thay đổi chương trình hoặc không đi qua liên kết phù hợp có thể làm mất ghi nhận."
        ]
      }
    ]
  },
  {
    "slug": "voucher-hoan-xu-shopee",
    "title": "Voucher hoàn xu và tiền hoàn khác nhau thế nào?",
    "description": "Phân biệt xu trong sàn với số dư cashback tại DealHoàn.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Xu của sàn",
        "paragraphs": [
          "Voucher hoàn xu thuộc chương trình của Shopee. Giá trị, hạn dùng và cách sử dụng xu thực hiện theo thông tin sàn công bố."
        ]
      },
      {
        "id": "phan-2",
        "title": "Số dư DealHoàn",
        "paragraphs": [
          "Tiền hoàn tại DealHoàn dựa trên hoa hồng của giao dịch được ghi nhận. Đây là số dư riêng, không tự chuyển thành Shopee Xu."
        ]
      },
      {
        "id": "phan-3",
        "title": "Kết hợp cần kiểm tra điều kiện",
        "paragraphs": [
          "Không mặc định hai chương trình luôn cộng dồn. Đọc điều kiện voucher và kết quả kiểm tra link; khoản hoàn cuối cùng có thể dựa trên giá trị sau giảm."
        ]
      }
    ]
  },
  {
    "slug": "deal-hoan-co-uy-tin-khong",
    "title": "Kiểm tra tính minh bạch của DealHoàn",
    "description": "Những thông tin bạn nên xem trước khi sử dụng.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Kiểm tra sản phẩm và liên kết",
        "paragraphs": [
          "Đối chiếu tên sản phẩm, giá và đích đến trước khi mua. Giao dịch đặt hàng và thanh toán diễn ra trên sàn, không phải chuyển tiền mua hàng cho DealHoàn."
        ]
      },
      {
        "id": "phan-2",
        "title": "Hiểu các trạng thái tiền",
        "paragraphs": [
          "Dự kiến chưa phải số dư đã duyệt. Theo dõi từng đơn, điều kiện chương trình và kết quả đối soát; không chỉ dựa trên một con số quảng bá."
        ]
      },
      {
        "id": "phan-3",
        "title": "Quyền riêng tư và hỗ trợ",
        "paragraphs": [
          "Đọc chính sách quyền riêng tư và điều khoản sử dụng. Giữ mã đơn để đối chiếu; không chia sẻ OTP hoặc mật khẩu với người khác."
        ]
      }
    ]
  },
  {
    "slug": "so-sanh-app-hoan-tien",
    "title": "So sánh các nền tảng hoàn tiền",
    "description": "Một cách so sánh dựa trên khoản thực nhận và trải nghiệm.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "So cùng sản phẩm và thời điểm",
        "paragraphs": [
          "Dùng cùng link, phiên bản và giá thanh toán để so. Kiểm tra xem con số là tỷ lệ tối đa, tiền dự kiến hay mức áp dụng cụ thể."
        ]
      },
      {
        "id": "phan-2",
        "title": "Tính cả giới hạn và thời gian",
        "paragraphs": [
          "Xem trần tiền hoàn, điều kiện khách mới, trạng thái được duyệt và mức rút tối thiểu. Tránh so hoa hồng của nền tảng với phần tiền khách thực nhận."
        ]
      },
      {
        "id": "phan-3",
        "title": "So khả năng theo dõi",
        "paragraphs": [
          "Ưu tiên nơi hiển thị trạng thái đơn và số dư rõ ràng. Một hành trình đơn giản không thay thế yêu cầu bảo vệ tài khoản và kiểm tra điều kiện."
        ]
      }
    ]
  },
  {
    "slug": "lich-sale-shopee",
    "title": "Theo dõi lịch sale và ngày đôi",
    "description": "Cách chuẩn bị cho đợt khuyến mãi mà không mua quá nhu cầu.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Xác nhận trên sàn",
        "paragraphs": [
          "Ngày đôi, chiến dịch tháng và các đợt khuyến mãi phụ thuộc thông báo của Shopee. Mức giảm và thời gian của từng cửa hàng có thể khác nhau."
        ]
      },
      {
        "id": "phan-2",
        "title": "Chuẩn bị trước",
        "paragraphs": [
          "Lưu sản phẩm và ngân sách, xem điều kiện mã, phí vận chuyển và giá trước đó. Hạn chế mua thêm chỉ để đạt ngưỡng giảm."
        ]
      },
      {
        "id": "phan-3",
        "title": "Tạo link khi sẵn sàng mua",
        "paragraphs": [
          "Quay lại DealHoàn để kiểm tra khoản hoàn mới nhất. Mua bằng link nhận hoàn và tránh chuyển sang liên kết tiếp thị khác trước khi thanh toán."
        ]
      }
    ]
  },
  {
    "slug": "cach-rut-tien-hoan",
    "title": "Cách rút tiền hoàn về ngân hàng",
    "description": "Phân biệt tiền đang chờ với số dư có thể rút.",
    "category": "Cẩm nang",
    "sections": [
      {
        "id": "phan-1",
        "title": "Điều kiện yêu cầu rút",
        "paragraphs": [
          "Tài khoản cần có số dư đã duyệt từ 10.000đ. Tiền chờ đối soát hoặc số tiền chỉ được ước tính trước khi mua chưa dùng để rút."
        ]
      },
      {
        "id": "phan-2",
        "title": "Kiểm tra thông tin ngân hàng",
        "paragraphs": [
          "Mở ví tài khoản, chọn yêu cầu rút và kiểm tra tên ngân hàng, số tài khoản, tên chủ tài khoản, số tiền. Chỉ gửi yêu cầu khi dữ liệu chính xác."
        ]
      },
      {
        "id": "phan-3",
        "title": "Theo dõi lịch sử",
        "paragraphs": [
          "Xem trạng thái chờ xử lý, hoàn tất hoặc từ chối trong lịch sử. Thời gian thực hiện phụ thuộc đối soát và xử lý; không áp dụng lịch thanh toán của nền tảng khác cho DealHoàn."
        ]
      }
    ]
  },
  {
    "slug": "how-to",
    "title": "Hướng dẫn sử dụng DealHoàn",
    "description": "Từ sao chép link đến theo dõi đơn và rút tiền.",
    "category": "Hỗ trợ",
    "sections": [
      {
        "id": "phan-1",
        "title": "1. Sao chép và kiểm tra link",
        "paragraphs": [
          "Từ trang sản phẩm hoặc quán được hỗ trợ, sao chép liên kết. Vào trang chủ DealHoàn, dán link và chọn Tính; đối chiếu đúng sản phẩm và khoản hoàn dự kiến."
        ]
      },
      {
        "id": "phan-2",
        "title": "2. Đăng nhập và mua qua link mới",
        "paragraphs": [
          "Đăng nhập DealHoàn trước khi mua. Chọn Mua ngay hoặc sao chép link nhận hoàn mới. Hoàn tất đặt hàng trên sàn; không xóa món đã thêm từ link hoặc mở thêm nguồn tiếp thị khác."
        ]
      },
      {
        "id": "phan-3",
        "title": "3. Theo dõi đơn",
        "paragraphs": [
          "Kiểm tra tài khoản và ví. Đơn có thể cần thời gian ghi nhận, kiểm tra điều kiện và xác nhận hoa hồng; khoản dự kiến có thể thay đổi."
        ]
      },
      {
        "id": "phan-4",
        "title": "4. Rút số dư đã duyệt",
        "paragraphs": [
          "Khi số dư đã duyệt đủ 10.000đ, bạn có thể yêu cầu rút về ngân hàng. Giữ mã đơn và kiểm tra lịch sử nếu cần đối chiếu."
        ]
      }
    ]
  },
  {
    "slug": "help",
    "title": "Trung tâm trợ giúp",
    "description": "Chọn đúng hướng xử lý khi link, đơn hoặc khoản hoàn chưa như mong đợi.",
    "category": "Hỗ trợ",
    "sections": [
      {
        "id": "phan-1",
        "title": "Link chưa ra kết quả",
        "paragraphs": [
          "Kiểm tra liên kết mở được trang sản phẩm và thuộc sàn hỗ trợ. Thử lấy lại link từ nút Chia sẻ. Đừng tiếp tục mua với kỳ vọng hoàn tiền nếu chưa có liên kết nhận hoàn hợp lệ."
        ]
      },
      {
        "id": "phan-2",
        "title": "Đơn chưa xuất hiện",
        "paragraphs": [
          "Kiểm tra tài khoản đã đăng nhập lúc tạo link. Giữ mã đơn, thời điểm mua và sản phẩm để đối chiếu. Thời gian ghi nhận không đồng nghĩa thời gian được duyệt."
        ]
      },
      {
        "id": "phan-3",
        "title": "Số tiền thay đổi hoặc đơn bị hủy",
        "paragraphs": [
          "Đọc điều kiện chương trình, giá trị thực trả và tình trạng hủy/hoàn hàng. Kết quả đối soát của sàn và đối tác quyết định khoản được duyệt."
        ]
      },
      {
        "id": "phan-4",
        "title": "Tài khoản và dữ liệu",
        "paragraphs": [
          "Xem chính sách quyền riêng tư để hiểu dữ liệu xác thực. Nếu cần yêu cầu xử lý dữ liệu, xem mục Xóa tài khoản và kênh hỗ trợ được công bố trong tài khoản DealHoàn."
        ]
      }
    ]
  },
  {
    "slug": "account-deletion",
    "title": "Xóa tài khoản và dữ liệu",
    "description": "Hướng dẫn chuẩn bị yêu cầu xóa dữ liệu DealHoàn.",
    "category": "Hỗ trợ",
    "sections": [
      {
        "id": "phan-1",
        "title": "Trước khi gửi yêu cầu",
        "paragraphs": [
          "Kiểm tra đơn đang chờ và số dư, lưu thông tin cần đối chiếu. Việc xóa dữ liệu có thể ảnh hưởng khả năng truy cập lịch sử tài khoản."
        ]
      },
      {
        "id": "phan-2",
        "title": "Gửi yêu cầu đúng tài khoản",
        "paragraphs": [
          "Đăng nhập bằng tài khoản liên quan, dùng kênh hỗ trợ được công bố trong tài khoản và ghi rõ yêu cầu xem, sửa hoặc xóa dữ liệu. Không gửi mật khẩu hay mã OTP."
        ]
      },
      {
        "id": "phan-3",
        "title": "Xử lý và lưu giữ cần thiết",
        "paragraphs": [
          "Một số dữ liệu giao dịch có thể cần giữ để đối soát, giải quyết tranh chấp hoặc đáp ứng nghĩa vụ liên quan. Yêu cầu được xem xét sau khi xác minh người gửi; trang này không tự xóa tài khoản khi mở."
        ]
      }
    ]
  },
  {
    "slug": "app",
    "title": "Dùng DealHoàn trên điện thoại",
    "description": "Truy cập từ trình duyệt và lưu lối tắt để sử dụng nhanh.",
    "category": "Hỗ trợ",
    "sections": [
      {
        "id": "phan-1",
        "title": "Mở bằng trình duyệt",
        "paragraphs": [
          "DealHoàn hoạt động trên trình duyệt điện thoại. Bạn có thể sao chép link từ ứng dụng sàn rồi quay lại trang chủ để kiểm tra khoản hoàn."
        ]
      },
      {
        "id": "phan-2",
        "title": "Lưu vào màn hình chính",
        "paragraphs": [
          "Dùng tùy chọn Thêm vào màn hình chính trong menu trình duyệt nếu thiết bị hỗ trợ. Đây là lối tắt đến website, không phải ứng dụng riêng trên kho tải."
        ]
      },
      {
        "id": "phan-3",
        "title": "Tiếp tục mua trên sàn",
        "paragraphs": [
          "Sau khi kiểm tra và đăng nhập, dùng link nhận hoàn mới. Cho phép thiết bị mở đúng ứng dụng sàn và kiểm tra sản phẩm trước khi đặt hàng."
        ]
      }
    ]
  },
  {
    "slug": "dieu-khoan",
    "title": "Điều khoản sử dụng",
    "description": "Các điều kiện khi sử dụng DealHoàn.",
    "category": "Chính sách",
    "sections": [
      {
        "id": "phan-1",
        "title": "Thông tin deal và cashback",
        "paragraphs": [
          "DealHoàn tổng hợp thông tin deal và hỗ trợ chuyển đổi liên kết hoàn tiền. Giá, mã, số lượng và khoản hoàn có thể thay đổi theo sàn hoặc đối tác; thông tin hiển thị không cam kết giá cuối cùng hay tiền hoàn được duyệt."
        ]
      },
      {
        "id": "phan-2",
        "title": "Điều kiện ghi nhận",
        "paragraphs": [
          "Mua qua liên kết đã chuyển đổi và tuân thủ điều kiện chương trình. Đơn hủy, hoàn trả hoặc vi phạm điều kiện của sàn có thể không được ghi nhận."
        ]
      },
      {
        "id": "phan-3",
        "title": "Tài khoản",
        "paragraphs": [
          "Bạn chịu trách nhiệm bảo vệ tài khoản. Không dùng dịch vụ để gian lận, can thiệp hệ thống hoặc ảnh hưởng quyền lợi người khác."
        ]
      },
      {
        "id": "phan-4",
        "title": "Thay đổi dịch vụ",
        "paragraphs": [
          "DealHoàn có thể cập nhật tính năng hoặc điều khoản theo hoạt động của nền tảng và yêu cầu đối tác. Phiên bản mới được công bố tại trang điều khoản."
        ]
      }
    ]
  },
  {
    "slug": "chinh-sach-bao-mat",
    "title": "Chính sách quyền riêng tư",
    "description": "Thông tin DealHoàn xử lý và các quyền của bạn.",
    "category": "Chính sách",
    "sections": [
      {
        "id": "phan-1",
        "title": "Thông tin đăng nhập",
        "paragraphs": [
          "Khi đăng nhập bằng Google, Supabase có thể lưu tên, email và ảnh đại diện do Google cung cấp. DealHoàn không nhận hoặc lưu mật khẩu Google của bạn."
        ]
      },
      {
        "id": "phan-2",
        "title": "Mục đích sử dụng",
        "paragraphs": [
          "Dữ liệu đăng nhập dùng để xác thực, bảo vệ phiên làm việc và hỗ trợ tính năng tài khoản, theo dõi cashback khi được kích hoạt."
        ]
      },
      {
        "id": "phan-3",
        "title": "Chia sẻ và bảo mật",
        "paragraphs": [
          "DealHoàn không bán thông tin cá nhân. Supabase và Google xử lý xác thực theo cấu hình dịch vụ; quyền truy cập dữ liệu cần thiết chỉ dành cho người hoặc hệ thống được ủy quyền."
        ]
      },
      {
        "id": "phan-4",
        "title": "Quyền của bạn",
        "paragraphs": [
          "Bạn có thể yêu cầu xem, sửa hoặc xóa dữ liệu tài khoản qua kênh hỗ trợ được công bố trên DealHoàn. Không cung cấp mật khẩu hoặc mã xác thực khi gửi yêu cầu."
        ]
      }
    ]
  }
];
export const featuredHelpSlugs = ["hoan-tien-shopee", "hoan-tien-shopeefood", "cach-san-ma-giam-gia-shopee", "cashback-shopee-la-gi", "app-hoan-tien-uy-tin", "cach-san-sale-shopee", "ma-giam-gia-shopeefood"];
export function getHelpArticle(slug: string) { return helpArticles.find(article => article.slug === slug); }
